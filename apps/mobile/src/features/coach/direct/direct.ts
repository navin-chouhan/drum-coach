// The coach on the iPad itself, for the API-key fallback: each route the home server has (feedback, plan, tips,
// lesson, month and the live session), answered by the Anthropic API with the server's prompts (prompts.gen.ts, from
// server/prompts) and validated with the same zod schemas (core coach/schemas.ts), cached like the server's ask()
// (server/ai/coach.ts: one answer per model, prompt and input; "ask again" replaces it). Answers come back in the
// server's response shapes, so the screens can't tell where they came from.
import {
  AiLessonSchema, CoachReplySchema, FeedbackSchema, LessonRequestSchema, MonthReportRequestSchema, MonthReportSchema, PlanRequestSchema, PlanSchema,
  SessionEventSchema, TipsRequestSchema, TipsSchema, type CoachReply,
} from '@drum-coach/core/coach/schemas';
import type { KeyValueStore } from '@drum-coach/core/platform';
import type { z } from 'zod';
import type { CoachContext } from '../../../data/coachContext';
import type { AnthropicClient, ApiMessage, DirectFailureKind } from './anthropic';
import { contextData, feedbackInput, lessonAnswer, lessonRouteInput, monthInput, planAnswer, planInput, sessionEvent, type PlanBody } from './inputs';
import { PROMPTS } from './prompts.gen';

export type DirectFailure = { ok: false; kind: DirectFailureKind | 'bad-request'; message: string };
export type DirectAnswer = { ok: true; data: unknown } | DirectFailure;
export type DirectPath = 'feedback' | 'plan' | 'tips' | 'lesson' | 'month';
export const DIRECT_PATHS: readonly DirectPath[] = ['feedback', 'plan', 'tips', 'lesson', 'month'];

export const COACH_CACHE_KEY = 'drumcoach.coachCache';
const CACHE_MAX = 60;
/** The server's live-session limits (server/ai/session.ts): a fresh conversation after 40 turns or 30 idle minutes. */
const MAX_TURNS = 40, IDLE_MS = 30 * 60_000;

/** server/ai/coach.ts extractJson: the JSON object in a reply, tolerating fences or stray text. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The coach did not answer with JSON.');
  try { return JSON.parse(text.slice(start, end + 1)); } catch { throw new Error('The coach answered with broken JSON.'); }
}

/** A 53-bit string hash (cyrb53) for cache keys: the iPad has no crypto module, and this only has to tell inputs apart. */
export function hash53(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const issue = (e: z.ZodError) => `${e.issues[0]?.path.join('.')}: ${e.issues[0]?.message}`;

export type DirectDeps = { client: AnthropicClient; kv: KeyValueStore; model(): string; now?: () => Date };

export function createDirectCoach(deps: DirectDeps) {
  const now = () => deps.now?.() ?? new Date();
  const readCache = (): Record<string, unknown> => { try { const v = JSON.parse(deps.kv.get(COACH_CACHE_KEY) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
  const writeCache = (key: string, value: unknown) => {
    const all = readCache();
    delete all[key];
    all[key] = value; // newest last; the oldest go first
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete all[k];
    try { deps.kv.set(COACH_CACHE_KEY, JSON.stringify(all)); } catch { /* a full store: just not cached */ }
  };

  /** server/ai/coach.ts ask(): system + task prompt, the input as JSON, cached, validated. */
  async function ask<T>(kind: 'feedback' | 'plan' | 'tips' | 'lesson' | 'month', schema: z.ZodType<T>, input: unknown, noCache = false):
    Promise<{ ok: true; data: T; cached: boolean } | DirectFailure> {
    const system = `${PROMPTS.system}\n\n${PROMPTS[kind]}`;
    const user = JSON.stringify(input);
    const key = hash53([`anthropic-api:${deps.model()}`, system, user].join('\0'));
    const hit = noCache ? undefined : readCache()[key];
    if (hit !== undefined) { const p = schema.safeParse(hit); if (p.success) return { ok: true, data: p.data, cached: true }; }
    const r = await deps.client.complete(system, [{ role: 'user', content: user }]);
    if (!r.ok) return r;
    let json: unknown;
    try { json = extractJson(r.text); } catch (e) { return { ok: false, kind: 'failed', message: (e as Error).message }; }
    const p = schema.safeParse(json);
    if (!p.success) return { ok: false, kind: 'failed', message: `The coach's answer didn't match the expected format (${issue(p.error)}).` };
    writeCache(key, p.data);
    return { ok: true, data: p.data, cached: false };
  }

  /** One coach route, with the body the iPad would have sent to the server (`context` included). */
  async function route(path: DirectPath, body: unknown): Promise<DirectAnswer> {
    const { context, ...rest } = (body && typeof body === 'object' ? body : {}) as { context?: CoachContext } & Record<string, unknown>;
    const d = contextData(context ?? {});
    const bad = (m: string): DirectFailure => ({ ok: false, kind: 'bad-request', message: m });
    switch (path) {
      case 'feedback': {
        const summary = rest.summary;
        if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return bad('summary: expected an object');
        const r = await ask('feedback', FeedbackSchema, feedbackInput(d, summary as Record<string, unknown>));
        return r.ok ? { ok: true, data: { data: r.data, cached: r.cached } } : r;
      }
      case 'tips': {
        const b = TipsRequestSchema.safeParse(rest);
        if (!b.success) return bad(issue(b.error));
        const r = await ask('tips', TipsSchema, b.data);
        return r.ok ? { ok: true, data: { data: { tips: Object.fromEntries(Object.entries(r.data.tips).filter(([id]) => b.data.cueIds.includes(id))) }, cached: r.cached } } : r;
      }
      case 'month': {
        const b = MonthReportRequestSchema.safeParse(rest);
        if (!b.success) return bad(issue(b.error));
        const m = monthInput(d, !!b.data.again, now());
        if ('kept' in m) return { ok: true, data: { data: m.kept, cached: true, month: m.month } };
        const r = await ask('month', MonthReportSchema, m.input, !!b.data.again);
        return r.ok ? { ok: true, data: { data: r.data, cached: r.cached, month: m.month } } : r;
      }
      case 'plan': {
        const b = PlanRequestSchema.safeParse(rest);
        if (!b.success) return bad(issue(b.error));
        const p = planInput(d, b.data as PlanBody, now());
        const r = await ask('plan', PlanSchema, p.input);
        return r.ok ? { ok: true, data: planAnswer(r.data, p.pickable, b.data.week) } : r;
      }
      case 'lesson': {
        const b = LessonRequestSchema.safeParse(rest);
        if (!b.success) return bad(issue(b.error));
        const input = lessonRouteInput(d, b.data.struggle, now());
        if (!input) return bad('No stage fits your goals yet. Change them under Setup → Coach and voice.');
        const r = await ask('lesson', AiLessonSchema, input);
        return r.ok ? { ok: true, data: lessonAnswer(d, input, r.data, r.cached) } : r;
      }
    }
  }

  // The live session (server/ai/session.ts ApiSession): the conversation kept in memory and re-sent each turn.
  let history: ApiMessage[] = [], turns = 0, lastUsed = 0;
  /** One session event; `onSay` gets the reply's spoken line (the API isn't streamed here, so it comes whole). */
  async function session(body: unknown, onSay: (s: string) => void): Promise<{ ok: true; reply: CoachReply } | DirectFailure> {
    const { context, ...rest } = (body && typeof body === 'object' ? body : {}) as { context?: CoachContext } & Record<string, unknown>;
    const b = SessionEventSchema.safeParse(rest);
    if (!b.success) return { ok: false, kind: 'bad-request', message: issue(b.error) };
    const t = now().getTime();
    if (turns >= MAX_TURNS || (lastUsed && t - lastUsed > IDLE_MS)) { history = []; turns = 0; }
    turns++; lastUsed = t;
    const msg: ApiMessage = { role: 'user', content: JSON.stringify(sessionEvent(contextData(context ?? {}), b.data, now())) };
    const r = await deps.client.complete(PROMPTS.session, [...history, msg], 2000);
    if (!r.ok) return r; // the failed turn isn't kept: the next one doesn't carry it
    let json: unknown;
    try { json = extractJson(r.text); } catch (e) { return { ok: false, kind: 'failed', message: (e as Error).message }; }
    const p = CoachReplySchema.safeParse(json);
    if (!p.success) return { ok: false, kind: 'failed', message: "The coach's answer didn't match the expected format." };
    history = [...history, msg, { role: 'assistant', content: r.text }];
    onSay(p.data.say);
    return { ok: true, reply: p.data };
  }

  return { route, session, endSession() { history = []; turns = 0; } };
}
export type DirectCoach = ReturnType<typeof createDirectCoach>;
