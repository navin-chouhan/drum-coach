// The coach's after-take line: the finished take goes to the live coach (POST /api/coach/session over the home
// server, with the iPad's context, D2/D7), its answer becomes the line on the results. Copied from src/coach/session.ts
// (coachLine, replyFor, thinkingAbout, screenAction, coachTake/coachEvent) for a later merge with A7e's coach panel.
// When the server is unreachable the app's own verdict stays and nothing else changes.
import { CoachReplySchema, type CoachReply, type SessionEvent } from '@drum-coach/core/coach/schemas';
import type { ApiFailure, HomeServer } from '../../platform/contracts';
import { summarizeRun } from './runRecord';
import type { Finished } from './types';

export type CoachState = {
  status: 'idle' | 'thinking';
  reply?: CoachReply; error?: string; failure?: ApiFailure['reason'];
  at: number;
  /** The take the reply is about / the take being thought about. */
  take?: Finished; thinking?: Finished;
};

/** The coach's answer to the take on screen `f` (a slow answer about an earlier take isn't). */
export const replyFor = (s: CoachState, f: Finished | undefined, openedAt: number) =>
  s.reply && (s.take ? s.take === f : s.at > Math.max(openedAt, f ? Date.parse(f.startedAt) : 0)) ? s.reply : undefined;

/**
 * The big coach line: the coach's answer to this take (its short screen line, else what it said), or the app's
 * verdict. A big moment (a record, a rank up, a finished lesson) keeps the app's verdict, with the coach's words under it.
 */
export function coachLine(verdict: string | undefined, reply: { say: string; show?: string } | undefined, big: boolean): { line?: string; under?: string } {
  if (!reply) return { line: verdict };
  const words = reply.show ?? reply.say;
  return big && verdict ? { line: verdict, under: words } : { line: words };
}
export const thinkingAbout = (s: CoachState, f: Finished | undefined) => s.status === 'thinking' && !!f && (!s.thinking || s.thinking === f);

type Action = NonNullable<CoachReply['action']>;
/** The coach's suggestion as the screen shows it: "next" gets the screen's label; a drill with nowhere to go is dropped. */
export function screenAction(a: Action | undefined, nextLabel: string, exists: (chartId: string) => boolean): Action | undefined {
  if (!a) return undefined;
  if (a.kind === 'next') return { ...a, label: nextLabel };
  if (a.kind === 'drill' && !a.chart && !(a.chartId && exists(a.chartId))) return undefined;
  return a;
}

export type CoachDeps = {
  server: Pick<HomeServer, 'configured' | 'stream'>;
  /** The coach `context` for the session route (Storage.coachContext('session').context). */
  context: () => Promise<unknown>;
  /** settings.liveCoach */
  enabled: () => boolean;
  now?: () => number;
  /** A sentence to speak as it arrives (never over a take: the screen decides). */
  onSay?: (text: string) => void;
};

export type CoachSession = {
  get(): CoachState;
  subscribe(fn: () => void): () => void;
  /** A finished take, once per take (wait mode and empty takes aren't). */
  take(f: Finished, lessonResult?: Record<string, unknown>): Promise<void>;
  /** Drops the suggestion's button (leaving the screen it was for); a drill stays unless `all`. */
  dropAction(all?: boolean): void;
};

export function createCoachSession(deps: CoachDeps): CoachSession {
  const now = deps.now ?? Date.now;
  let state: CoachState = { status: 'idle', at: 0 };
  const listeners = new Set<() => void>();
  const set = (s: Partial<CoachState>) => { state = { ...state, ...s }; listeners.forEach(l => l()); };
  const told = new WeakSet<Finished>();
  let seq = 0;

  async function event(e: SessionEvent, take?: Finished) {
    if (!deps.enabled() || !deps.server.configured()) return;
    const my = ++seq;
    set({ status: 'thinking', error: undefined, failure: undefined, at: now(), thinking: take });
    let reply: CoachReply | undefined, error: string | undefined;
    const context = await deps.context().catch(() => undefined);
    const r = await deps.server.stream('/api/coach/session', { ...e, ...(context !== undefined && { context }) }, ev => {
      if (ev.event === 'say' && typeof ev.json === 'string') deps.onSay?.(ev.json);
      if (ev.event === 'reply') { const p = CoachReplySchema.safeParse(ev.json); if (p.success) reply = p.data; }
      if (ev.event === 'error') error = (ev.json as { error?: string } | undefined)?.error ?? 'Coach unavailable';
    }, { timeoutMs: 120_000 });
    if (my !== seq) return; // a newer event took over
    if (!r.ok) { set({ status: 'idle', error: r.detail ?? r.reason, failure: r.reason, at: now() }); return; }
    if (error) { set({ status: 'idle', error, at: now() }); return; }
    // Only the student's own "yes" starts something; after a plain take `now` is a button.
    if (reply?.action?.now) reply = { ...reply, action: { ...reply.action, now: false } };
    set({ status: 'idle', reply, at: now(), take });
  }

  return {
    get: () => state,
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    take(f, lessonResult) {
      if (told.has(f) || f.options.wait || !f.stats.total) return Promise.resolve();
      told.add(f);
      return event({ type: 'take', ...summarizeRun(f), ...(lessonResult && { lessonResult }) }, f);
    },
    dropAction(all = false) {
      if (state.reply?.action && (all || state.reply.action.kind !== 'drill')) set({ reply: { ...state.reply, action: undefined } });
    },
  };
}
