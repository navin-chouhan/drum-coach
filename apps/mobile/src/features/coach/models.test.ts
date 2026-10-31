import { describe, expect, it, vi } from 'vitest';
import type { Feedback } from '@drum-coach/core/coach/schemas';
import type { Chart } from '@drum-coach/core/engine/chart';
import { isoWeek } from '@drum-coach/core/engine/progress';
import type { PlanRecord } from '../../data/records';
import { createCoachAsks } from './asks';
import { chartIdFor, COACH_CHARTS_KEY, createCoachCharts, targetExists } from './charts';
import { createContextFor } from './context';
import { createKv } from '../../data/kv';
import { openTestDb } from '../../data/nodeSqlite.testutil';
import { migrate } from '../../data/schema';
import { createChartsRepo, migrateCoachCharts, sqliteTime } from '../../data/songs';
import { createDataStore } from '../../data/store';
import { askFeedback, createSpeakOnce, feedbackKey, feedbackView, spokenLine } from './feedback';
import { coachProblem, hostOf } from './problem';
import { summarizeTake } from './summary';
import { applyTip, createTipsCache, cueIdsFor, TIPS_KEY } from './tips';
import { cleanPlanForm, createWeekPlan, planItemLine, planItemTarget, savedPlanOf } from './weekPlan';
import { fakeServer, fakeTake, memoryKv, unreachable } from './coach.testutil';

const flush = () => new Promise(r => setTimeout(r, 0));

describe('the take summary (src/coach/summary.ts on the core take)', () => {
  it('is compact: tempo from the take, weak spots worst first, tips and the lesson', () => {
    const s = summarizeTake(fakeTake(), { chartId: 'rock-basic', lesson: { lesson: 'The money beat' } });
    expect(s.exercise).toEqual({ id: 'rock-basic', title: 'The money beat', kind: 'groove', level: 2, timeSignature: '4/4' });
    expect(s.tempo).toEqual({ bpm: 70, chartBpm: 80, speedPct: 88 });
    expect(s.weakSpots[0]).toEqual({ position: 'beat 2', notes: 6, missed: 3, avgAbsOffsetMs: 60 });
    expect(s.weakSpots).toHaveLength(3);
    expect(s.perDrum.kick).toEqual({ notes: 16, accuracyPct: 94, meanOffsetMs: -40 });
    expect(s.liveTips).toEqual(['Rushing by 30 ms. Sit back on the click']);
    expect(s.tipIds).toEqual(['rushing']);
    expect(s.lesson).toEqual({ lesson: 'The money beat' });
    expect(JSON.stringify(s)).not.toContain('hits');
  });
});

describe('what failed', () => {
  it('unreachable: the host, the seconds, and no fallback; it can wait', () => {
    const p = coachProblem(unreachable, { url: 'http://drum-laptop.local:8787' });
    expect(p).toMatchObject({ kind: 'offline', host: 'drum-laptop.local:8787', canQueue: true, settingsFirst: false });
    expect(p.lines).toEqual(['drum-laptop.local:8787 didn’t answer in 10 seconds. Is the laptop awake and on the same Wi-Fi (or Tailscale)?', "No API key is set, so there's no fallback."]);
  });
  it('a refused token or host sends you to the settings; a coach error shows the server\'s words', () => {
    expect(coachProblem({ ok: false, reason: 'unauthorized', status: 401 })).toMatchObject({ kind: 'refused', settingsFirst: true, canQueue: false });
    expect(coachProblem({ ok: false, reason: 'not-configured' })).toMatchObject({ kind: 'not-configured', settingsFirst: true });
    expect(coachProblem({ ok: false, reason: 'server-error', status: 503, detail: 'The claude CLI was not found.' }).lines).toEqual(['The claude CLI was not found.']);
    expect(hostOf('nope')).toBeUndefined();
  });
});

describe('one-off coach questions', () => {
  it('ask once per key, with the route context; tips carry none', async () => {
    const f = fakeServer();
    f.answerCalls(async path => ({ ok: true, data: path.endsWith('tips') ? { data: { tips: {} }, cached: false } : { data: { feedback: 'ok' }, cached: true } }));
    const context = vi.fn(async (route: string) => ({ charts: [{ id: route, title: 'x', bpm: 80 }] }));
    const asks = createCoachAsks({ server: f.server, context });
    await asks.ask('k', 'feedback', { summary: { notes: 1 } });
    await asks.ask('k', 'feedback', { summary: { notes: 1 } });
    await asks.ask('t', 'tips', { title: 'x', cueIds: ['even'] });
    expect(f.calls).toHaveLength(2);
    expect(f.calls[0]).toEqual({ method: 'POST', path: '/api/coach/feedback', body: { summary: { notes: 1 }, context: { charts: [{ id: 'feedback', title: 'x', bpm: 80 }] } } });
    expect(f.calls[1].body).toEqual({ title: 'x', cueIds: ['even'] });
    expect(asks.entry('k')).toEqual({ status: 'done', data: { feedback: 'ok' }, cached: true, note: undefined });
    await asks.ask('k', 'feedback', {}, undefined, true);
    expect(f.calls).toHaveLength(3);
  });
  it("a failure reads the Keychain's API key (async) for the fallback line", async () => {
    const f = fakeServer();
    f.answerCalls(async () => unreachable);
    let key = false;
    const asks = createCoachAsks({ server: f.server, context: async () => ({}), hasFallbackKey: () => Promise.resolve(key) });
    await asks.ask('a', 'plan', {});
    expect(asks.entry('a')?.problem?.lines[1]).toBe("No API key is set, so there's no fallback.");
    key = true; // saved in Setup meanwhile: the next failure knows
    await asks.ask('b', 'plan', {});
    expect(asks.entry('b')?.problem?.lines[1]).toBe("The API-key fallback isn't built yet, so there's no fallback.");
  });
  it('an unreadable storage still sends an empty context (never the server\'s own data); a failure is an error entry', async () => {
    const f = fakeServer();
    f.answerCalls(async () => unreachable);
    const asks = createCoachAsks({ server: f.server, context: async () => { throw new Error('db'); } });
    const seen = vi.fn();
    asks.subscribe(seen);
    await asks.ask('p', 'plan', { week: '2026-W44' });
    expect(f.calls[0].body).toEqual({ week: '2026-W44', context: {} });
    expect(asks.entry('p')).toMatchObject({ status: 'error', problem: { kind: 'offline' } });
    expect(seen).toHaveBeenCalledTimes(2); // thinking, then the error
    f.answerCalls(async () => ({ ok: true, data: { data: 1 } }));
    await asks.ask('p', 'plan', {});
    expect(asks.entry('p')?.status).toBe('done'); // an error is asked again
  });
});

describe('feedback after a take', () => {
  const fb: Feedback = { feedback: 'Nice. The kick ran ahead.', drill: { title: 'Kick with the hat', instructions: 'Hat 8ths, kick on 1 and 3.', bpm: 65, chartId: 'rock-basic' } };
  it('asks with the summary, speaks once, and has a drill to play when its target exists', async () => {
    const f = fakeServer();
    f.answerCalls(async () => ({ ok: true, data: { data: fb, cached: false } }));
    const asks = createCoachAsks({ server: f.server, context: async () => ({}) });
    const t = fakeTake();
    await askFeedback(asks, t.startedAt, summarizeTake(t));
    expect(f.calls[0].body).toMatchObject({ summary: { accuracyPct: 96 } });
    const exists = (id: string) => id === 'rock-basic';
    expect(feedbackView(asks.entry(feedbackKey(t.startedAt)), exists)).toEqual({ state: 'done', feedback: fb.feedback, drill: fb.drill, kicker: 'Drill · 65 BPM', target: { chartId: 'rock-basic', bpm: 65 }, cached: false });
    expect(feedbackView(asks.entry(feedbackKey(t.startedAt)), () => false)).toMatchObject({ target: undefined });
    expect(feedbackView(undefined, exists)).toEqual({ state: 'ask' });
    const say = vi.fn();
    const once = createSpeakOnce(say, () => true);
    once('a', fb); once('a', fb);
    expect(say.mock.calls).toEqual([['Nice.']]);
    expect(spokenLine({ ...fb, spoken: 'Lift the foot.' })).toBe('Lift the foot.');
  });
});

describe("the coach's saved exercises (the charts table, source 'ai': QA m8)", () => {
  const chart: Chart = { title: 'Kick with the hat!', bpm: 65, timeSignature: [4, 4], bars: 1, notes: [{ t: 0, drum: 'kick' }] };
  const table = () => { const db = openTestDb(); migrate(db); return createChartsRepo(db, () => 0.123456); };
  it("saved once per chart (the server's id rule), newest first, found as a drill target", () => {
    const charts = table();
    const c = createCoachCharts({ charts });
    const a = c.save(chart);
    expect(a.id).toBe(chartIdFor('Kick with the hat!', () => 0.123456));
    expect(a.id).toMatch(/^kick-with-the-hat-[a-z0-9]{5}$/);
    expect(a).toMatchObject({ source: 'ai', kind: 'exercise', hasAudio: false });
    expect(charts.get(a.id)?.source).toBe('ai');
    expect(c.save({ ...chart, kind: 'exercise' }).id).toBe(a.id);
    const imported = charts.save({ ...chart, title: 'A song' }, 'import');
    c.save({ ...chart, title: 'Other' });
    expect(c.list().map(x => x.title)).toEqual(['Other', 'Kick with the hat!']);
    expect(targetExists(a.id, { coachCharts: c })).toBe(true);
    expect(targetExists(imported.id, { coachCharts: c })).toBe(true);
    expect(targetExists('rock-basic')).toBe(false);
    expect(targetExists('lesson/nope')).toBe(false);
    expect(targetExists('lesson/x', { aiLessonIds: new Set(['x']) })).toBe(true);
  });
  it('kept in memory for the session when the database is missing', () => {
    let r = 0.1;
    const c = createCoachCharts({ charts: null }, { random: () => (r += 0.1) });
    const a = c.save(chart);
    expect(c.save(chart).id).toBe(a.id);
    expect(c.byId(a.id)?.title).toBe('Kick with the hat!');
    expect(c.list()).toHaveLength(1);
  });
  it('go into the context from storage (contextSource reads the table)', async () => {
    const db = openTestDb();
    const s = createDataStore(() => db);
    const c = createCoachCharts(s);
    c.save(chart);
    const ctx = await createContextFor(s)('feedback');
    expect(ctx.charts).toEqual([{ id: c.list()[0].id, title: 'Kick with the hat!', kind: 'exercise', bpm: 65, timeSignature: [4, 4], bars: 1, notes: [{ t: 0, drum: 'kick' }] }]);
  });
  it('the old key-value list moves into the table once, keeping ids and order', () => {
    const db = openTestDb();
    migrate(db);
    const kv = createKv(db, () => {});
    kv.set(COACH_CHARTS_KEY, JSON.stringify([
      { ...chart, title: 'Newer', id: 'newer-bbbbb', source: 'ai', savedAt: '2026-10-30T19:00:00.000Z' },
      { ...chart, id: 'older-aaaaa', source: 'ai', savedAt: '2026-10-29T08:00:00.000Z' },
      { title: 'broken', id: 'broken-ccccc' },
    ]));
    const s = createDataStore(() => db);
    expect(s.kv.get(COACH_CHARTS_KEY)).toBeNull();
    const c = createCoachCharts(s);
    expect(c.list().map(x => x.id)).toEqual(['newer-bbbbb', 'older-aaaaa']);
    expect(c.byId('older-aaaaa')).toMatchObject({ title: 'Kick with the hat!', source: 'ai', kind: 'exercise' });
    expect(c.byId('older-aaaaa')).not.toHaveProperty('savedAt');
    expect(migrateCoachCharts(s.kv, s.charts!)).toBe(0); // nothing left to move
    kv.set(COACH_CHARTS_KEY, '{broken');
    expect(migrateCoachCharts(s.kv, s.charts!)).toBe(0);
    expect(s.kv.get(COACH_CHARTS_KEY)).toBeNull();
    expect(sqliteTime('2026-10-29T08:00:00.000Z')).toBe('2026-10-29 08:00:00');
    expect(sqliteTime('nope')).toBeNull();
  });
});

describe('the live tips, written ahead of time and cached on the iPad', () => {
  const chart = { id: 'rock-basic', title: 'Rock basic', bpm: 90, timeSignature: [4, 4] as [number, 4], bars: 1, notes: [{ t: 0, drum: 'kick' as const }, { t: 1, drum: 'snare' as const }, { t: 2, drum: 'kick' as const }] };
  const cue = { id: 'rushing', text: 'Rushing by 30 ms. Sit back on the click', spoken: 'Rushing. Sit back', priority: 70 };
  it('fills {ms} from the rule (web applyTip)', () => {
    expect(applyTip({ text: 'Ahead by {ms} ms: sit back', spoken: 'Sit back {ms} ms' }, cue)).toEqual({ ...cue, text: 'Ahead by 30 ms: sit back', spoken: 'Sit back' });
    expect(applyTip({ text: 'Sit {ms} ms back', spoken: 'Back' }, { ...cue, text: 'Rushing' })).toMatchObject({ text: 'Sit back' });
    expect(applyTip(undefined, cue)).toBe(cue);
    expect(cueIdsFor(chart)).toEqual(['rushing', 'dragging', 'unsteady', 'extras', 'hh-open', 'accents', 'ghosts', 'even', 'praise', 'missing-kick', 'missing-snare']);
  });
  it('asks once per exercise, keeps the answer in storage for later sessions, and respects the switches', async () => {
    const kv = memoryKv();
    const f = fakeServer();
    f.answerCalls(async () => ({ ok: true, data: { data: { tips: { rushing: { text: 'Ahead by {ms} ms', spoken: 'Wait for it' }, bad: { text: 1 } } } } }));
    const settings = { aiTips: true, liveTips: 'screen' as 'off' | 'screen' | 'voice' };
    const prepare = vi.fn();
    const asks = createCoachAsks({ server: f.server, context: async () => ({}) });
    const tips = createTipsCache({ kv, asks, settings: () => settings, prepare });
    await tips.load(chart, 'steady time');
    await tips.load(chart);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({ path: '/api/coach/tips', body: { title: 'Rock basic', goal: 'steady time' } });
    expect(prepare).toHaveBeenCalledWith(['Wait for it']);
    expect(tips.wordingFor(chart)(cue)).toMatchObject({ text: 'Ahead by 30 ms', spoken: 'Wait for it' });
    // a new session reads the cache: no call
    const again = createTipsCache({ kv, asks: createCoachAsks({ server: f.server, context: async () => ({}) }), settings: () => settings });
    expect(again.has(chart)).toBe(true);
    await again.load(chart);
    expect(f.calls).toHaveLength(1);
    expect(JSON.parse(kv.get(TIPS_KEY)!)).toEqual({ 'rock-basic': { rushing: { text: 'Ahead by {ms} ms', spoken: 'Wait for it' } } });
    settings.liveTips = 'off';
    await tips.load({ ...chart, id: 'other' });
    expect(f.calls).toHaveLength(1);
  });
});

describe('the week plan, kept on the iPad', () => {
  const plan = { title: 'Week of steady time', focus: 'The kick with the hat', week: isoWeek(new Date('2026-10-30T12:00:00Z')), days: [{ day: 'Mon', items: [{ title: 'Money beat', minutes: 10, chartId: 'rock-basic', bpm: 70 }, { title: 'A song', minutes: 5, chartId: 'yt-abc' }] }] };
  function repo() {
    const rows: PlanRecord[] = [];
    return {
      rows,
      latest: async () => rows.at(-1) ?? null,
      add: (p: Record<string, unknown>) => { rows.push({ id: rows.length + 1, plan: p, checks: {} }); return rows.length; },
      setChecks: (id: number, checks: Record<string, unknown>) => { const r = rows.find(x => x.id === id); if (r) r.checks = checks; return !!r; },
    };
  }
  it('makes a plan with the context, stores it, and ticks items', async () => {
    const plans = repo();
    const f = fakeServer();
    f.answerCalls(async () => ({ ok: true, data: { plan, checks: {} } }));
    const asks = createCoachAsks({ server: f.server, context: async () => ({ runs: [] }) });
    const wp = createWeekPlan({ plans, asks });
    const key = wp.make({ goals: '  ', minutesPerDay: 500, daysPerWeek: 0 });
    await flush(); await flush();
    expect(f.calls[0].body).toEqual({ goals: 'Steady time on rock grooves and cleaner fills', minutesPerDay: 180, daysPerWeek: 5, context: { runs: [] } });
    expect(asks.entry(key)?.status).toBe('done');
    expect(wp.get()?.plan.title).toBe('Week of steady time');
    wp.toggle('0.0');
    expect(plans.rows[0].checks).toEqual({ '0.0': true });
    expect(wp.thisWeeks(new Date('2026-10-30T12:00:00Z'))?.focus).toBe('The kick with the hat');
    expect(wp.thisWeeks(new Date('2026-11-20T12:00:00Z'))).toBeUndefined();
  });
  it("asks for this week's plan once, only when the stored one is another week's", async () => {
    const plans = repo();
    plans.add({ ...plan, week: '2026-W40' });
    const f = fakeServer();
    f.answerCalls(async () => ({ ok: true, data: { plan, checks: {} } }));
    const wp = createWeekPlan({ plans, asks: createCoachAsks({ server: f.server, context: async () => ({}) }) });
    await wp.ensure(new Date('2026-10-30T12:00:00Z'));
    await wp.ensure(new Date('2026-10-30T12:00:00Z'));
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].body).toMatchObject({ week: plan.week });
    expect(plans.rows).toHaveLength(2);
  });
  it('a plan the coach got wrong is an error, not a stored plan; item links and lines', async () => {
    const plans = repo();
    const f = fakeServer();
    f.answerCalls(async () => ({ ok: true, data: { plan: { nope: 1 } } }));
    const asks = createCoachAsks({ server: f.server, context: async () => ({}) });
    const key = createWeekPlan({ plans, asks }).make(cleanPlanForm({ goals: 'x', minutesPerDay: '25', daysPerWeek: '3' }));
    await flush(); await flush();
    expect(asks.entry(key)).toMatchObject({ status: 'error' });
    expect(plans.rows).toHaveLength(0);
    expect(savedPlanOf({ id: 1, plan: {}, checks: {} })).toBeNull();
    const exists = (id: string) => id === 'rock-basic';
    expect(planItemTarget(plan.days[0].items[0], exists)).toEqual({ kind: 'play', chartId: 'rock-basic', bpm: 70 });
    expect(planItemTarget(plan.days[0].items[1], exists)).toEqual({ kind: 'song', id: 'yt-abc' });
    expect(planItemTarget({ chartId: 'gone' }, exists)).toBeUndefined();
    expect(planItemLine(plan.days[0].items[0])).toBe('Money beat · 10 min · 70 BPM');
  });
});
