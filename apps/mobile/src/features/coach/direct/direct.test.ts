import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRICULUM, MILESTONES } from '@drum-coach/core/content/curriculum';
import type { AiLesson } from '@drum-coach/core/coach/schemas';
import { DEFAULTS } from '@drum-coach/core/input/settings';
import { describe, expect, it } from 'vitest';
import type { CoachContext } from '../../../data/coachContext';
import type { ApiFailure, HomeServer } from '../../../platform/contracts';

type Srv = Pick<HomeServer, 'call' | 'stream'>;
import { ANTHROPIC_URL, createAnthropicClient, DEFAULT_COACH_MODEL, type FetchLike } from './anthropic';
import { COACH_CACHE_KEY, createDirectCoach, extractJson, hash53 } from './direct';
import { withDirectFallback } from './fallback';
import * as mine from './inputs';
import { PROMPTS } from './prompts.gen';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
// The server's own modules, loaded at test time only (not type-checked or bundled with the app): the parity checks.
const serverModule = (rel: string) => import(/* @vite-ignore */ join(ROOT, rel)) as Promise<Record<string, (...a: unknown[]) => unknown>>;

const KEY = 'sk-ant-test-0123456789abcdef';
type Call = { url: string; headers: Record<string, string>; body: { model: string; max_tokens: number; system: string; messages: { role: string; content: string }[]; fallbacks: string } };

/** A fake fetch that answers each call with the next reply (an object becomes the model's JSON text). */
function fakeApi(replies: (unknown | { status: number; body?: unknown } | Error)[]) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const r = replies.shift();
    if (r instanceof Error) throw r;
    if (r && typeof r === 'object' && 'status' in r) { const x = r as { status: number; body?: unknown }; return { ok: x.status < 300, status: x.status, json: async () => x.body ?? {} }; }
    const text = typeof r === 'string' ? r : JSON.stringify(r);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }], stop_reason: 'end_turn' }) };
  };
  return { fetch, calls };
}
function memKv() {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); }, remove: (k: string) => { m.delete(k); }, m };
}
function rig(replies: Parameters<typeof fakeApi>[0], key: string | null = KEY) {
  const api = fakeApi(replies), kv = memKv();
  const client = createAnthropicClient({ fetch: api.fetch, key: async () => key, model: () => DEFAULT_COACH_MODEL });
  const direct = createDirectCoach({ client, kv, model: () => DEFAULT_COACH_MODEL, now: () => new Date(2026, 9, 30, 19) });
  return { api, kv, client, direct };
}
const FEEDBACK = { feedback: 'Your kick drags on 3.', drill: { title: 'Kick on 3', instructions: 'Slow quarters, kick on 3.', bpm: 70 } };
const run = (day: number, over: Record<string, unknown> = {}) => ({
  chartId: 'singles', chartTitle: 'Singles', startedAt: new Date(2026, 9, day, 18).toISOString(), durationS: 300, bpm: 80, speed: 1, accuracy: 82,
  meanOffset: 9, spread: 14, summary: { notes: 40, meanOffsetMs: 9, spreadMs: 14, perDrum: { snare: { n: 40, hit: 33, offset: 9 } } }, ...over,
});
const CONTEXT = {
  runs: [run(29), run(20), run(25, { chartId: 'lesson/count-quarters/1', chartTitle: 'Quarter notes' })],
  settings: { profile: { goals: ['rock'], minutesPerDay: 25, onboarded: true }, lessons: {}, soreUntil: undefined },
  teacherNotes: [{ date: '2026-10-01', text: 'Relax the wrists.' }],
  plan: { focus: 'even 8ths', why: 'they rush', drums: ['hihat'] },
} as unknown as CoachContext;

describe('prompts (generated from server/prompts)', () => {
  it('match the .md files exactly: run npm run gen:prompts after changing one', () => {
    const dir = join(ROOT, 'server', 'prompts');
    const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort();
    expect(Object.keys(PROMPTS).sort()).toEqual(files.map(f => f.replace(/\.md$/, '')));
    for (const f of files) expect(PROMPTS[f.replace(/\.md$/, '') as keyof typeof PROMPTS]).toBe(readFileSync(join(dir, f), 'utf8'));
  });
});

describe('the Messages API over fetch', () => {
  it("sends the server's request: model, system, one user message, the refusal fallback; the key only in x-api-key", async () => {
    const { api, client } = rig([{ ok: 1 }]);
    expect(await client.complete('SYS', [{ role: 'user', content: '{"a":1}' }])).toEqual({ ok: true, text: '{"ok":1}' });
    const c = api.calls[0];
    expect(c.url).toBe(ANTHROPIC_URL);
    expect(c.headers).toEqual({ 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2026-10-21', 'anthropic-beta': 'server-side-fallback-2026-07-01' });
    expect(c.body).toEqual({ model: 'claude-sonnet-5-5', max_tokens: 16000, system: 'SYS', messages: [{ role: 'user', content: '{"a":1}' }], fallbacks: 'default' });
    expect(JSON.stringify(c.body)).not.toContain(KEY);
  });

  it('says what failed, never with the key in it', async () => {
    const { client, api } = rig([
      { status: 401, body: { error: { message: `invalid x-api-key ${KEY}` } } }, { status: 429 }, { status: 529, body: { error: { message: 'Overloaded' } } },
      { status: 200, body: { stop_reason: 'refusal', content: [] } }, new TypeError('Network request failed'),
    ]);
    const all = [];
    for (let i = 0; i < 5; i++) all.push(await client.complete('S', [{ role: 'user', content: 'x' }]));
    expect(all.map(r => (r.ok ? 'ok' : r.kind))).toEqual(['auth', 'rate-limited', 'failed', 'refused', 'network']);
    expect(all[2]).toMatchObject({ message: 'API error 529: Overloaded' });
    expect(JSON.stringify(all)).not.toContain(KEY);
    expect(api.calls).toHaveLength(5);
  });

  it('without a key it never calls; a slow answer times out', async () => {
    const none = rig([], null);
    expect(await none.client.complete('S', [{ role: 'user', content: 'x' }])).toMatchObject({ ok: false, kind: 'auth' });
    expect(none.api.calls).toHaveLength(0);
    const slow = createAnthropicClient({ key: async () => KEY, model: () => '', timeoutMs: 5,
      fetch: (_u, init) => new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))) });
    expect(await slow.complete('S', [{ role: 'user', content: 'x' }])).toMatchObject({ ok: false, kind: 'timeout' });
  });
});

describe('the routes on the iPad', () => {
  it("feedback: system + task prompt, the server's input, validated with FeedbackSchema, cached like the server", async () => {
    const { direct, api, kv } = rig([`Here you go:\n\`\`\`json\n${JSON.stringify(FEEDBACK)}\n\`\`\``]);
    const body = { summary: { accuracyPct: 80 }, context: CONTEXT };
    expect(await direct.route('feedback', body)).toEqual({ ok: true, data: { data: FEEDBACK, cached: false } });
    expect(api.calls[0].body.system).toBe(`${PROMPTS.system}\n\n${PROMPTS.feedback}`);
    const input = JSON.parse(api.calls[0].body.messages[0].content);
    expect(input.run).toEqual({ accuracyPct: 80 });
    expect(input.library.length).toBeGreaterThan(5);
    expect(await direct.route('feedback', body)).toEqual({ ok: true, data: { data: FEEDBACK, cached: true } });
    expect(api.calls).toHaveLength(1);
    expect(Object.keys(JSON.parse(kv.get(COACH_CACHE_KEY)!))).toHaveLength(1);
  });

  it("an answer that isn't JSON or doesn't match the schema fails in the server's words, and isn't cached", async () => {
    const { direct, kv } = rig(['no json here', { feedback: '' }]);
    expect(await direct.route('feedback', { summary: {} })).toEqual({ ok: false, kind: 'failed', message: 'The coach did not answer with JSON.' });
    const r = await direct.route('feedback', { summary: {} });
    expect(r).toMatchObject({ ok: false, kind: 'failed' });
    expect(!r.ok && r.message).toMatch(/^The coach's answer didn't match the expected format \(/);
    expect(kv.get(COACH_CACHE_KEY)).toBeNull();
    expect(await direct.route('feedback', {})).toMatchObject({ ok: false, kind: 'bad-request' });
  });

  it('tips: only the cue ids asked for come back', async () => {
    const { direct } = rig([{ tips: { rushing: { text: 'Lay back a little', spoken: 'Lay back' }, other: { text: 'x', spoken: 'y' } } }]);
    expect(await direct.route('tips', { title: 'Rock beat', cueIds: ['rushing'] }))
      .toEqual({ ok: true, data: { data: { tips: { rushing: { text: 'Lay back a little', spoken: 'Lay back' } } }, cached: false } });
  });

  it("plan: the server's input, lessonIds filtered to the pickable ones, { plan, checks }", async () => {
    const pickable = mine.planInput(mine.contextData(CONTEXT), {}).input.lessons.map(l => l.id);
    const { direct, api } = rig([{ title: 'This week', focus: 'even 8ths', lessonIds: [pickable[0], 'made-up'], days: [{ day: 'Mon', items: [{ title: 'Warm-up', minutes: 5 }] }] }]);
    const r = await direct.route('plan', { week: '2026-W44', context: CONTEXT });
    expect(r).toMatchObject({ ok: true, data: { plan: { title: 'This week', lessonIds: [pickable[0]], week: '2026-W44' }, checks: {} } });
    const input = JSON.parse(api.calls[0].body.messages[0].content);
    expect(input).toMatchObject({ week: '2026-W44', goals: 'rock', minutesPerDay: 25, lastWeek: { focus: 'even 8ths' }, student: { teacherNotes: CONTEXT.teacherNotes } });
  });

  it("month: the kept report this month without a call; again asks anew", async () => {
    const report = { headline: 'A steady month', better: ['8ths'], next: ['kick'], note: 'Keep going.' };
    const { direct, api } = rig([{ ...report, headline: 'Again' }]);
    const ctx = { ...CONTEXT, monthReport: { month: '2026-10', report } } as CoachContext;
    expect(await direct.route('month', { context: ctx })).toEqual({ ok: true, data: { data: report, cached: true, month: '2026-10' } });
    expect(api.calls).toHaveLength(0);
    expect(await direct.route('month', { again: true, context: ctx })).toMatchObject({ ok: true, data: { data: { headline: 'Again' }, cached: false, month: '2026-10' } });
  });

  it('lesson: validated, made a lesson of the current stage with replaces (unstarted coach lessons of that stage)', async () => {
    const cp = CURRICULUM.find(l => l.id === MILESTONES[0].checkpoints[0])!;
    const a: AiLesson = { title: 'Steady quarters', kind: 'exercise', focus: 'Even quarter notes', what: 'w', why: 'y', how: 'h',
      steps: [{ title: 'Play', text: 't', chart: { ...cp.steps[0].chart, id: undefined } as never, bpm: { start: 60, target: 70 } }] } as unknown as AiLesson;
    const old = { ...cp, id: 'ai-old-1', title: 'Old', source: 'ai', level: MILESTONES[0].level };
    const { direct } = rig([a]);
    const r = await direct.route('lesson', { context: { ...CONTEXT, aiLessons: [old] } as CoachContext });
    if (!r.ok) throw new Error(r.message);
    const d = r.data as { data: { id: string; level: number; source: string; steps: { chart: { id: string } }[] }; replaces: string[] };
    expect(d.data).toMatchObject({ level: MILESTONES[0].level, source: 'ai' });
    expect(d.data.id).toMatch(/^ai-steady-quarters-/);
    expect(d.data.steps[0].chart.id).toBe(`lesson/${d.data.id}/1`);
    expect(d.replaces).toEqual(['ai-old-1']);
  });

  it('the live session: session.md, the event with the student, the conversation re-sent each turn', async () => {
    const { direct, api } = rig([{ say: 'Nice. Again, a bit slower.', show: 'Again at 70' }, { say: 'Better.' }, new TypeError('offline')]);
    const said: string[] = [];
    const r1 = await direct.session({ type: 'take', result: { accuracy: 80 }, context: CONTEXT }, s => said.push(s));
    expect(r1).toMatchObject({ ok: true, reply: { say: 'Nice. Again, a bit slower.' } });
    expect(api.calls[0].body.system).toBe(PROMPTS.session);
    expect(api.calls[0].body.max_tokens).toBe(2000);
    const ev = JSON.parse(api.calls[0].body.messages[0].content);
    expect(ev).toMatchObject({ type: 'take', result: { accuracy: 80 }, weekFocus: { focus: 'even 8ths' }, teacherNotes: [{ date: '2026-10-01', text: 'Relax the wrists.' }] });
    expect(ev.context).toBeUndefined(); // the context never goes to the model as is
    await direct.session({ type: 'said', text: 'thanks' }, s => said.push(s));
    expect(api.calls[1].body.messages.map(m => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(said).toEqual(['Nice. Again, a bit slower.', 'Better.']);
    expect(await direct.session({ type: 'said', text: 'x' }, () => {})).toMatchObject({ ok: false, kind: 'network' });
    expect(api.calls[2].body.messages).toHaveLength(5);
  });

  it('helpers: extractJson tolerates fences, hash53 tells inputs apart', () => {
    expect(extractJson('```json\n{"a":{"b":1}}\n```')).toEqual({ a: { b: 1 } });
    expect(() => extractJson('{oops}')).toThrow('The coach answered with broken JSON.');
    expect(hash53('a\0b')).not.toBe(hash53('a\0c'));
    expect(hash53('same')).toBe(hash53('same'));
  });
});

describe('the fallback: home server first, the API only when it is away', () => {
  const unreachable: ApiFailure = { ok: false, reason: 'unreachable', detail: 'no answer within 30 s' };
  const fakeServer = (r: { ok: true; data: unknown } | ApiFailure) => {
    const calls: string[] = [];
    return { calls, server: { call: async (_m: string, p: string) => { calls.push(p); return r; }, stream: async () => r as ApiFailure, configured: () => ({ url: 'http://x' }) } };
  };
  it('uses the server when it answers, and never the key', async () => {
    const { direct, api } = rig([FEEDBACK]);
    const { server } = fakeServer({ ok: true, data: { data: 'from server' } });
    const s = withDirectFallback(server as unknown as Srv, direct, async () => true);
    expect(await s.call('POST', '/api/coach/feedback', { summary: {} })).toEqual({ ok: true, data: { data: 'from server' } });
    expect(api.calls).toHaveLength(0);
  });

  it('server away + key: the iPad asks the API; no key: the server failure as before', async () => {
    const a = rig([FEEDBACK]);
    const away = withDirectFallback(fakeServer(unreachable).server as unknown as Srv, a.direct, async () => true);
    expect(await away.call('POST', '/api/coach/feedback', { summary: {} })).toEqual({ ok: true, data: { data: FEEDBACK, cached: false } });
    const b = rig([FEEDBACK]);
    const noKey = withDirectFallback(fakeServer(unreachable).server as unknown as Srv, b.direct, async () => false);
    expect(await noKey.call('POST', '/api/coach/feedback', { summary: {} })).toBe(unreachable);
    expect(b.api.calls).toHaveLength(0);
    const refused: ApiFailure = { ok: false, reason: 'unauthorized', status: 401 };
    const c = rig([FEEDBACK]);
    expect(await withDirectFallback(fakeServer(refused).server as unknown as Srv, c.direct, async () => true).call('POST', '/api/coach/feedback', { summary: {} })).toBe(refused);
    expect(await withDirectFallback(fakeServer(unreachable).server as unknown as Srv, c.direct, async () => true).call('GET', '/api/health')).toBe(unreachable);
    expect(c.api.calls).toHaveLength(0);
  });

  it("the fallback offline too: the server's failure (the offline card); another error: the coach's error line", async () => {
    const a = rig([new TypeError('offline'), { status: 401 }, { status: 429 }]);
    const s = withDirectFallback(fakeServer(unreachable).server as unknown as Srv, a.direct, async () => true);
    expect(await s.call('POST', '/api/coach/feedback', { summary: {} })).toBe(unreachable);
    expect(await s.call('POST', '/api/coach/feedback', { summary: {} }))
      .toEqual({ ok: false, reason: 'server-error', detail: 'The API-key fallback: The Anthropic API key in Setup → Coach · fallback was rejected.' });
    expect(await s.call('POST', '/api/coach/feedback', { summary: {} })).toMatchObject({ ok: false, reason: 'rate-limited' });
  });

  it('the live session falls back as say + reply events', async () => {
    const a = rig([{ say: 'Hello.' }, { status: 500 }]);
    const s = withDirectFallback(fakeServer(unreachable).server as unknown as Srv, a.direct, async () => true);
    const events: { event: string; json?: unknown }[] = [];
    expect(await s.stream('/api/coach/session', { type: 'open' }, e => events.push(e))).toEqual({ ok: true, events: 2 });
    expect(events.map(e => e.event)).toEqual(['say', 'reply']);
    expect(events[0].json).toBe('Hello.');
    events.length = 0;
    await s.stream('/api/coach/session', { type: 'said', text: 'x' }, e => events.push(e));
    expect(events).toEqual([{ event: 'error', data: '', json: { error: 'API error 500' } }]);
  });
});

describe('parity with the server (the copied input builders)', () => {
  it('contextData and lessonInput build what the server builds from the same context', async () => {
    const sc = await serverModule('server/coachContext.ts'), sl = await serverModule('server/ai/lessons.ts');
    const theirs = sc.contextData(CONTEXT) as ReturnType<typeof mine.contextData>, ours = mine.contextData(CONTEXT);
    expect(ours.runRows()).toEqual(theirs.runRows());
    expect(ours.runRows(2)).toEqual(theirs.runRows(2));
    expect(ours.recentForLesson()).toEqual(theirs.recentForLesson());
    expect(ours.pastTakes('singles')).toEqual(theirs.pastTakes('singles'));
    expect(ours.teacherNotes()).toEqual(theirs.teacherNotes());
    expect(mine.weekFocus(ours)).toEqual((sc.weekFocus as (d: unknown) => unknown)(theirs));
    const state = { profile: { ...DEFAULTS.profile, goals: ['rock'] }, progress: {}, aiLessons: [], recent: ours.recentForLesson(), teacherNotes: ours.teacherNotes(), weekFocus: mine.weekFocus(ours) };
    expect(JSON.parse(JSON.stringify(mine.lessonInput(state as never)))).toEqual(JSON.parse(JSON.stringify(sl.lessonInput(state))));
  });

  it('uniqueTitle, toLesson, standsInFor and canStandIn agree with the server', async () => {
    const sl = await serverModule('server/ai/lessons.ts');
    const titles = CURRICULUM.map(l => l.title);
    for (const [t, f] of [[CURRICULUM[0].title, 'Even quarters, every time'], ['Fresh title', 'x'], [CURRICULUM[1].title, '']]) {
      expect(mine.uniqueTitle(t, f, titles)).toBe(sl.uniqueTitle(t, f, titles));
    }
    const a = { title: 'My Lesson!', steps: [{ title: 'One', chart: { notes: [] } }] } as unknown as AiLesson;
    expect(mine.toLesson(a, 2, 'abcde')).toEqual(sl.toLesson(a, 2, 'abcde'));
    const cp = CURRICULUM.find(l => l.id === MILESTONES[1].checkpoints[0])!, end = cp.steps[cp.steps.length - 1];
    expect(mine.standsInFor(end, cp)).toBe(sl.standsInFor(end, cp));
    expect(mine.standsInFor({ ...end, bpm: { start: 40, target: 40 } }, cp)).toBe(sl.standsInFor({ ...end, bpm: { start: 40, target: 40 } }, cp));
    expect(mine.canStandIn(end)).toBe(sl.canStandIn(end));
    expect(mine.canStandIn({ ...end, rest: true } as never)).toBe(sl.canStandIn({ ...end, rest: true }));
  });
});
