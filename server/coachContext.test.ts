import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTEXT_MAX_BYTES, contextData, runRowOf, splitContext, weekFocus, type CoachContext } from './coachContext';

// The live coach is a long-running claude process: replaced here, so no test ever starts the CLI.
const turns: Record<string, unknown>[] = [];
vi.mock('./ai/session.ts', () => ({
  coachTurn: (event: Record<string, unknown>, onSay: (s: string) => void) => { turns.push(event); onSay('Nice.'); return Promise.resolve({ say: 'Nice.' }); },
}));
process.env.CLAUDE_BIN = '/nonexistent/claude'; // belt and braces: a status check can't find a real CLI either
const { app } = await import('./index');
const { setProvider } = await import('./ai/coach');
const { db } = await import('./db');
afterAll(() => app.close());

const run = (chartId: string, startedAt: string, accuracy: number, summary?: Record<string, unknown>) => ({
  chartId, chartTitle: `Title ${chartId}`, startedAt, durationS: 60, bpm: 80.4, speed: 1, accuracy, meanOffset: 4, spread: 12, ...(summary && { summary }),
});
const chart = { title: 'Bar', bpm: 80, timeSignature: [4, 4] as [number, 4], bars: 1, notes: [{ t: 0, drum: 'kick' as const }, { t: 1, drum: 'snare' as const }] };
const savedLesson = (id: string, level: number) => ({ id, level, kind: 'groove', title: `Saved ${id}`, what: '', why: '', how: '', source: 'ai', steps: [{ title: 'Play', text: '', chart, bpm: { start: 60, target: 80 } }] });

describe('the context', () => {
  it('leaves a body without context alone', () => {
    expect(splitContext({ summary: { a: 1 } })).toEqual({ rest: { summary: { a: 1 } } });
    expect(splitContext(undefined)).toEqual({ rest: undefined });
    expect(splitContext([1])).toEqual({ rest: [1] });
    expect(splitContext({ again: true, context: undefined })).toEqual({ rest: { again: true } });
  });
  it('validates it and caps its size', () => {
    expect(splitContext({ context: { runs: [{ chartId: 'x' }] } }).error).toMatch(/^context\.runs\.0\./);
    expect(splitContext({ context: { settings: { profile: { goals: ['polka'], minutesPerDay: 20 } } } }).error).toMatch(/goals/);
    const big = { teacherNotes: Array.from({ length: 20 }, () => ({ date: '2026-10-01', text: 'x'.repeat(3000) })) };
    expect(splitContext({ context: big }).error).toMatch(new RegExp(`larger than ${CONTEXT_MAX_BYTES / 1000} KB`));
    const ok = splitContext({ week: '2026-W44', context: { runs: [run('a', '2026-10-01T10:00:00.000Z', 90)] } });
    expect(ok.rest).toEqual({ week: '2026-W44' });
    expect(ok.context?.runs?.[0].chartId).toBe('a');
  });
  it('reads like the SQLite rows: oldest first, the summary fields runRows extracts', () => {
    const c: CoachContext = { runs: [
      run('b', '2026-10-03T10:00:00.000Z', 70, { notes: 32, section: { fromBar: 2, toBar: 3 }, tipIds: ['rush'], perDrum: { kick: { notes: 8, accuracyPct: 90, meanOffsetMs: 3 } }, lesson: { tool: 'drill', bite: { songId: 's', fromBar: 1, toBar: 2 } }, velocity: { cv: 9 }, weakSpots: [3], meanOffsetMs: 4, spreadMs: 12 }),
      run('a', '2026-10-01T10:00:00.000Z', 90), run('a', '2026-10-02T10:00:00.000Z', 80), run('a', '2026-10-02T10:00:00.000Z', 85),
    ], plan: { focus: 'steady kick', why: 'it rushes', drums: ['kick'], notes: 'n' }, teacherNotes: ['1', '2', '3', '4'].map(d => ({ date: `2026-10-0${d}`, text: d })) };
    const d = contextData(c);
    expect(d.fromDevice).toBe(true);
    expect(d.runRows().map(r => r.accuracy)).toEqual([90, 80, 85, 70]);
    expect(d.runRows(2).map(r => r.accuracy)).toEqual([85, 70]);
    expect(d.runRows(0)).toEqual([]);
    expect(d.runRows().at(-1)).toMatchObject({ notes: 32, fromBar: 2, toBar: 3, tips: ['rush'], tool: 'drill', bite: { songId: 's', fromBar: 1, toBar: 2 }, hasTake: false });
    expect(runRowOf(run('a', '2026-10-01T10:00:00.000Z', 90))).toMatchObject({ notes: undefined, tips: undefined, perDrum: undefined, tool: undefined, bite: undefined });
    expect(d.pastTakes('a')).toEqual([90, 80, 85].map((a, i) => ({ at: `2026-10-0${i ? 2 : 1}T10:00`, bpm: 80, accuracyPct: a, meanOffsetMs: 4, spreadMs: 12 })));
    expect(d.recentForLesson().at(-1)).toEqual({ chart: 'Title b', at: '2026-10-03T10:00', bpm: 80, accuracy: 70,
      summary: { meanOffsetMs: 4, spreadMs: 12, perDrum: { kick: { notes: 8, accuracyPct: 90, meanOffsetMs: 3 } }, velocity: { cv: 9 }, weakSpots: [3], lesson: { tool: 'drill', bite: { songId: 's', fromBar: 1, toBar: 2 } } } });
    expect(d.teacherNotes().map(n => n.text)).toEqual(['2', '3', '4']);
    expect(weekFocus(d)).toEqual({ focus: 'steady kick', why: 'it rushes', drums: ['kick'] });
    expect(weekFocus(contextData({}))).toBeUndefined();
    const empty = contextData({});
    expect([empty.settings(), empty.aiLessons(), empty.songs(), empty.savedCharts(), empty.monthReport(), empty.song('x')]).toEqual([{}, [], [], [], undefined, undefined]);
  });
});

// ---------- the coach routes, with a fake coach ----------
let inputs: { system: string; input: Record<string, unknown> }[] = [];
let answer = '{}';
setProvider({ name: 'fake-coach', complete: (system, user) => { inputs.push({ system, input: JSON.parse(user) as Record<string, unknown> }); return Promise.resolve(answer); } });
const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, headers: { host: 'localhost:8787' }, payload: payload as object });
const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const lastInput = () => inputs[inputs.length - 1].input;

// The web app's data on this server.
db.prepare(`INSERT INTO runs (chart_id, chart_title, started_at, duration_s, bpm, speed, accuracy, mean_offset, spread, summary_json)
  VALUES ('server-chart', 'Server run', '2026-09-01T10:00:00.000Z', 60, 90, 1, 55, 2, 10, '{}')`).run();
db.prepare("INSERT INTO charts (id, json, source) VALUES ('server-ex', ?, 'ai')").run(JSON.stringify({ ...chart, title: 'Server exercise' }));
db.prepare("INSERT INTO settings (key, value) VALUES ('monthReport', ?)").run(JSON.stringify({ month: '1999-01', report: { headline: 'old', better: [], next: [], note: '' } }));

const ctx = (extra: Record<string, unknown> = {}) => ({ runs: [run('ipad-chart', '2026-10-20T09:00:00.000Z', 95)], ...extra });
beforeEach(() => { inputs = []; });

describe('coach routes: SQLite without a context, the context with one', () => {
  it('feedback: the catalog has this server\'s exercises, or the iPad\'s', async () => {
    answer = JSON.stringify({ feedback: 'Good', drill: { title: 'd', instructions: 'i' } });
    expect((await post('/api/coach/feedback', { summary: { accuracy: 1 } })).statusCode).toBe(200);
    const titles = () => (lastInput().library as { title: string }[]).map(c => c.title);
    expect(titles()).toContain('Server exercise');
    const r = await post('/api/coach/feedback', { summary: { accuracy: 1 }, context: { charts: [{ id: 'ipad-ex', title: 'iPad exercise', bpm: 70 }] } });
    expect(r.statusCode).toBe(200);
    expect(titles()).toContain('iPad exercise');
    expect(titles()).not.toContain('Server exercise');
    expect(lastInput().run).toEqual({ accuracy: 1 }); // the context isn't the run
  });
  it('plan: from the context, not stored here; the context is part of the cache key', async () => {
    answer = JSON.stringify({ title: 'Week', focus: 'time' });
    const plans = count('plans');
    const own = await post('/api/coach/plan', {});
    expect(own.json()).toMatchObject({ id: expect.any(Number), plan: { title: 'Week' } });
    expect((lastInput().recent as { chart: string }[]).map(x => x.chart)).toEqual(['Server run']);
    expect(count('plans')).toBe(plans + 1);

    const ipad = await post('/api/coach/plan', { context: ctx({ songs: [{ id: 'yt-1', title: 'iPad song' }] }) });
    expect(ipad.statusCode).toBe(200);
    expect(ipad.json()).toEqual({ plan: { title: 'Week', focus: 'time' }, checks: {} }); // no id: the iPad keeps it
    expect(lastInput().recent).toEqual([{ chart: 'Title ipad-chart', bpm: 80, accuracy: 95, at: '2026-10-20' }]);
    expect(lastInput().songs).toEqual([{ id: 'yt-1', title: 'iPad song' }]);
    expect(count('plans')).toBe(plans + 1);

    const calls = inputs.length;
    await post('/api/coach/plan', { context: ctx({ songs: [{ id: 'yt-1', title: 'iPad song' }] }) });
    expect(inputs.length).toBe(calls); // the same context: the cached answer
    await post('/api/coach/plan', { context: ctx() });
    expect(inputs.length).toBe(calls + 1); // another context: asked again
  });
  it('month: the iPad\'s last report, and the new one is not kept here', async () => {
    answer = JSON.stringify({ headline: 'Up', better: [], next: [], note: '' });
    const month = new Date().toLocaleDateString('sv').slice(0, 7);
    const mine = await post('/api/coach/month', { context: { monthReport: { month, report: { headline: 'Kept on the iPad', better: [], next: [], note: '' } } } });
    expect(mine.json()).toEqual({ data: { headline: 'Kept on the iPad', better: [], next: [], note: '' }, cached: true, month });
    expect(inputs).toEqual([]);
    const fresh = await post('/api/coach/month', { context: ctx({ monthReport: { month: '2026-01', report: { headline: 'January', better: [], next: [], note: '' } } }) });
    expect(fresh.json()).toMatchObject({ data: { headline: 'Up' }, month });
    expect(lastInput().lastReport).toMatchObject({ headline: 'January' });
    expect(JSON.parse((db.prepare("SELECT value FROM settings WHERE key = 'monthReport'").get() as { value: string }).value).month).toBe('1999-01');
    await post('/api/coach/month', {});
    expect(lastInput().lastReport).toMatchObject({ headline: 'old' }); // without a context: this server's report
    expect(JSON.parse((db.prepare("SELECT value FROM settings WHERE key = 'monthReport'").get() as { value: string }).value).month).toBe(month);
  });
  it('lesson: bites from the iPad\'s songs, nothing saved here, and the lessons it replaces', async () => {
    answer = JSON.stringify({ title: 'Kick bite', kind: 'groove', focus: 'f', what: 'w', why: 'y', how: 'h',
      steps: [{ title: 'Bite', text: 't', chart: { ...chart, notes: [{ t: 0, drum: 'snare' }] }, bpm: { start: 60, target: 80 }, bite: { songId: 'yt-ipad', fromBar: 1, toBar: 1 } }] });
    const lessons = count('ai_lessons');
    const song = { id: 'yt-ipad', title: 'iPad song', notes: [{ t: 0, drum: 'kick' }, { t: 2, drum: 'kick' }] };
    const saved = [savedLesson('ai-old-0', 0), savedLesson('ai-old-1', 1), savedLesson('ai-started', 0)];
    const r = await post('/api/coach/lesson', { context: ctx({ songs: [song], aiLessons: saved, settings: { lessons: { 'ai-started': { step: 0, bpm: 60 } } } }) });
    expect(r.statusCode).toBe(200);
    const { data, replaces } = r.json<{ data: { level: number; steps: { chart: { notes: { drum: string }[] }; bite: { title: string } }[] }; replaces: string[] }>();
    expect(data.steps[0].bite.title).toBe('iPad song');
    expect(data.steps[0].chart.notes.map(n => n.drum)).toEqual(['kick', 'kick']); // cut from the iPad's song
    expect(replaces).toEqual(saved.filter(l => l.level === data.level && l.id !== 'ai-started').map(l => l.id));
    expect((lastInput().recentRuns as { chart: string }[]).map(x => x.chart)).toEqual(['Title ipad-chart']);
    expect(count('ai_lessons')).toBe(lessons);

    inputs = [];
    const own = await post('/api/coach/lesson', {});
    expect(own.statusCode).toBe(200);
    expect(own.json()).not.toHaveProperty('replaces');
    expect((lastInput().recentRuns as { chart: string }[]).map(x => x.chart)).toEqual(['Server run']);
    expect(count('ai_lessons')).toBe(lessons + 1);
  });
  it('session: the iPad\'s history goes to the coach, the context payload does not', async () => {
    const r = await post('/api/coach/session', { type: 'open', chartId: 'ipad-chart', context: ctx({ plan: { focus: 'relax' }, settings: { soreUntil: '2999-01-01' } }) });
    expect(r.body).toContain('event: reply');
    const e = turns[turns.length - 1];
    expect(e).not.toHaveProperty('context');
    expect(e).toMatchObject({ type: 'open', chartId: 'ipad-chart', pastTakes: [{ accuracyPct: 95 }], weekFocus: { focus: 'relax' }, sore: true });
    await post('/api/coach/session', { type: 'open', chartId: 'server-chart' });
    expect(turns[turns.length - 1]).toMatchObject({ pastTakes: [{ accuracyPct: 55 }] });
    expect(turns[turns.length - 1]).not.toHaveProperty('sore');
  });
  it('a bad or oversized context is a 400 that never reaches the coach', async () => {
    for (const url of ['/api/coach/feedback', '/api/coach/plan', '/api/coach/lesson', '/api/coach/month', '/api/coach/session']) {
      const r = await post(url, { type: 'open', summary: {}, context: { runs: 'all of them' } });
      expect(r.statusCode).toBe(400);
      expect(r.json<{ error: string }>().error).toMatch(/^context\.runs/);
    }
    expect((await post('/api/coach/plan', { context: { teacherNotes: Array.from({ length: 20 }, () => ({ date: 'd', text: 'x'.repeat(3000) })) } })).statusCode).toBe(400);
    expect(inputs).toEqual([]);
  });
});

describe('health and access through the real app', () => {
  it('health: what works here, no secrets', async () => {
    process.env.YOUTUBE_API_KEY = 'AIza-secret-key';
    const r = await app.inject({ url: '/api/health', headers: { host: 'localhost:8787' } });
    delete process.env.YOUTUBE_API_KEY;
    expect(r.json()).toMatchObject({ ok: true, version: '1.0.0', coach: true, youtube: true, provider: 'fake-coach', tts: expect.any(Boolean), stt: expect.any(Boolean) });
    expect(r.body).not.toContain('AIza');
  });
  it('without APP_TOKEN, another machine gets the 403 it always got', async () => {
    const r = await app.inject({ url: '/api/health', remoteAddress: '192.168.1.50', headers: { host: 'localhost:8787' } });
    expect(r.statusCode).toBe(403);
  });
  it('the server refuses to start on the LAN without a strong token', () => {
    for (const env of [{ HOST: '192.168.1.20', APP_TOKEN: '' }, { HOST: '0.0.0.0', APP_TOKEN: 'too-short' }]) {
      const r = spawnSync(process.execPath, [join(import.meta.dirname, 'index.ts')], { env: { ...process.env, ...env, PORT: '0', ALLOWED_HOSTS: '' }, encoding: 'utf8', timeout: 30_000 });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/APP_TOKEN .*Not starting\./);
    }
  });
});
