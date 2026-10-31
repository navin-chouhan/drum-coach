import { CURRICULUM, MILESTONES } from '@drum-coach/core/content/curriculum';
import { isoWeek, type RunRow } from '@drum-coach/core/engine/progress';
import { DEFAULTS } from '@drum-coach/core/input/settings';
import type { YtSong } from '@drum-coach/core/youtube/schemas';
import { describe, expect, it, vi } from 'vitest';
import { createDataStore } from '../../data/store';
import { openTestDb } from '../../data/nodeSqlite.testutil';
import { ago, dayKey, minutesWords, shortDate, thousands } from './dates';
import { allLessons, loadStoredData } from './data';
import { askMonthReport, coachUnavailable, historyModel, keptReport, keptTakeChart } from './monthReport';
import { lessonWords, practiseTarget, progressModel, starString } from './progress';
import { skillMapModel } from './skillMap';

const NOW = new Date(2026, 9, 30, 19, 0); // Friday 30 Oct 2026, local time
const at = (day: number, hour = 18, month = 9) => new Date(2026, month, day, hour).toISOString();
const run = (chartId: string, accuracy: number, day: number, over: Partial<RunRow> = {}): RunRow => ({
  chartId, chartTitle: chartId, startedAt: at(day), durationS: 600, bpm: 80, speed: 1, accuracy, meanOffset: 5, spread: 15, notes: 40, ...over,
});
const base = { progress: {}, profile: DEFAULTS.profile, lessons: CURRICULUM, now: NOW };

describe('dates', () => {
  it('says days the web way without Intl', () => {
    expect(shortDate('2026-10-09')).toBe('9 Oct');
    expect(ago('2026-10-30', '2026-10-30')).toBe('today');
    expect(ago('2026-10-29', '2026-10-30')).toBe('yesterday');
    expect(ago('2026-10-27', '2026-10-30')).toBe('Tue');
    expect(ago('2026-10-01', '2026-10-30')).toBe('1 Oct');
    expect([minutesWords(400), minutesWords(25)]).toEqual(['6 h 40 min', '25 min']);
    expect(thousands(4812)).toBe('4,812');
    expect(thousands(1234567)).toBe('1,234,567');
  });
});

describe('progress', () => {
  it('day one: empty states, Stage 1, no trophies yet', () => {
    const m = progressModel({ ...base, runs: [] });
    expect(m.empty).toBe(true);
    expect(m.since).toBeUndefined();
    expect(m.better.line).toBe('Play your first take and this fills in.');
    expect(m.better.days).toEqual([]);
    expect(m.better.best).toBeUndefined();
    expect(m.week.streak).toBe(0);
    expect(m.week.minutes).toBe(0);
    expect(m.week.goalMinutes).toBe(175);
    expect(m.week.rank).toBe(`New drummer · Stage 1 · ${MILESTONES[0].title}`);
    expect(m.week.dots.map(d => d.letter).join('')).toBe('MTWTFSS');
    expect(m.week.dots[4].today).toBe(true); // Friday
    expect(m.trophies.earned).toBe(0);
    expect(m.trophies.closest).toHaveLength(3);
    expect(m.trophies.later.at(-1)).toBe(`+ ${MILESTONES.length} rank trophies`);
    expect(m.time.days).toHaveLength(14);
    expect(m.time.top).toBe(35);
    expect(m.lessons).toEqual([]);
    expect(m.skills.now).toEqual([]);
  });
  it('with history: the head line, getting better, this week and your time', () => {
    const runs = [
      run('lesson/count-quarters/1', 60, 26, { chartTitle: 'Quarter notes · on the snare' }),
      run('singles', 70, 27), run('singles', 85, 29, { bpm: 90 }), run('disco', 97, 30, { chartTitle: 'Disco (four on the floor)' }),
    ];
    const m = progressModel({ ...base, runs, badges: ['first-3star'] });
    expect(m.since).toBe('Since Mon 26 Oct · 4 days · 4 takes · 40 min');
    expect(m.better.days.map(d => d.pct)).toEqual([60, 70, 85, 97]);
    expect(m.better.days[0].title).toBe('Mon 26 Oct: 60% of notes landed, 1 take');
    expect(m.better.line).toContain('That is a real jump in a week');
    expect(m.better.landed).toBe(thousands(24 + 28 + 34 + 39));
    expect(m.better.best).toEqual({ pct: '97%', of: 'Disco (four on the floor)' });
    expect(m.week.dots.map(d => d.on)).toEqual([true, true, false, true, true, false, false]);
    expect(m.week.streak).toBe(2);
    expect(m.week.minutes).toBe(40);
    expect(m.time.days.at(-1)).toMatchObject({ minutes: 10, atGoal: false });
    expect(m.trophies.badges.map(b => b.id)).toEqual(['first-3star']); // kept once earned
    expect(m.lessons[0]).toMatchObject({ lessonId: 'count-quarters', takes: 1, best: 60, words: '1 take, best 60%', practise: { kind: 'lesson', lessonId: 'count-quarters' } });
    expect(m.exercises.map(e => e.chartId).sort()).toEqual(['disco', 'singles']);
    expect(m.exercises.find(e => e.chartId === 'disco')?.practise).toEqual({ kind: 'practice', chartId: 'disco', bpm: 85 });
    expect(m.skills.now.length).toBeGreaterThan(0); // the lesson's skills, from its takes
  });
  it("this week's focus: the coach's plan for this week, else the tip given most", () => {
    const tips = Array.from({ length: 5 }, (_, i) => run('singles', 80, 26 + i, { tips: ['rushing'] }));
    expect(progressModel({ ...base, runs: tips }).week.focus).toBe('rushing ahead of the click');
    expect(progressModel({ ...base, runs: tips, plan: { week: isoWeek(NOW), focus: 'kick with the hi-hat' } }).week.focus).toBe('kick with the hi-hat');
    expect(progressModel({ ...base, runs: tips, plan: { week: '2020-W01', focus: 'old' } }).week.focus).toBe('rushing ahead of the click');
  });
  it('ranks earned and proven show as trophies', () => {
    const today = dayKey(NOW);
    const progress = Object.fromEntries(MILESTONES[0].checkpoints.map(id => [id, { step: 0, bpm: 60, clean: 0, fails: 0, bestBpm: 60, reviewStage: 1, completedAt: today, stars: 3 }]));
    const m = progressModel({ ...base, runs: [], progress });
    expect(m.trophies.ranks).toEqual([expect.objectContaining({ name: MILESTONES[0].rank, proven: true })]);
    expect(m.week.rank.startsWith(MILESTONES[0].rank)).toBe(true);
    expect(m.trophies.earned).toBeGreaterThanOrEqual(2); // the rank and First ★★★
  });
  it('lessons in plain words', () => {
    const p = { step: 2, bpm: 75, clean: 0, fails: 0, bestBpm: 70, reviewStage: 0 };
    expect(lessonWords(p, 5, { bpm: 75, started: 60, takes: 4, best: 80 }, '2026-10-30')).toBe('step 3, 75 next (started at 60)');
    expect(lessonWords({ ...p, completedAt: '2026-10-29', stars: 2, reviewDue: '2026-11-04' }, 5, { takes: 4, best: 80 }, '2026-10-30')).toBe('back for review in 5 days');
    expect(lessonWords({ ...p, completedAt: '2026-10-20', stars: 1 }, 5, { takes: 4, best: 80 }, '2026-10-30')).toBe('shaky: worth one more go');
    expect(lessonWords({ ...p, completedAt: '2026-10-20', stars: 3, reviewDue: '2026-10-29' }, 5, { takes: 4, best: 80 }, '2026-10-30')).toBe('due for a review');
    expect(starString(2)).toBe('★★☆');
  });
  it('each row goes back to where it was played', () => {
    expect(practiseTarget('lesson/money-quarters/3')).toEqual({ kind: 'lesson', lessonId: 'money-quarters' });
    expect(practiseTarget('jam-yt-abc')).toEqual({ kind: 'song', songId: 'yt-abc' });
    expect(practiseTarget('singles', null)).toEqual({ kind: 'practice', chartId: 'singles' });
    expect(practiseTarget('singles', 80)).toEqual({ kind: 'practice', chartId: 'singles', bpm: 85 });
  });
});

describe('your path', () => {
  it('every stage with its challenges; the first is current on day one', async () => {
    const { pathModel, progressViewOf } = await import('./path');
    const stages = pathModel(CURRICULUM, {}, DEFAULTS.profile);
    expect(stages[0]).toMatchObject({ n: 1, title: MILESTONES[0].title, state: 'current', canDo: MILESTONES[0].canDo });
    expect(stages[1].state).toBe('later');
    expect(stages[0].chips.filter(c => c.checkpoint).map(c => c.id)).toEqual(MILESTONES[0].checkpoints);
    expect(stages[0].chips[0]).toMatchObject({ state: 'todo', detail: 'Not started' });
    const done = { step: 0, bpm: 60, clean: 0, fails: 0, bestBpm: 70, reviewStage: 0, completedAt: '2026-10-29', stars: 2 };
    const progress = Object.fromEntries(MILESTONES[0].checkpoints.map(id => [id, done]));
    const after = pathModel(CURRICULUM, progress, DEFAULTS.profile);
    expect(after[0].state).toBe('passed');
    expect(after[0].chips[0]).toMatchObject({ state: 'done', stars: 2, detail: 'Done · 2 of 3 stars · best 70 BPM' });
    expect(after[1].state).toBe('current');
    expect([progressViewOf('skills'), progressViewOf('path'), progressViewOf('month'), progressViewOf('x'), progressViewOf(undefined)]).toEqual(['skills', 'path', 'month', 'main', 'main']);
  });

  it("the web's Full path actions: rebuild today's mix, goals (change), reset all lesson progress", async () => {
    const { goalsLabel, rebuildNeedsConfirm, rebuildTodayPatch, resetAllLessonsPatch } = await import('./path');
    expect(goalsLabel(DEFAULTS.profile)).toBe('Goals: not sure yet · 25 min/day (change)');
    expect(goalsLabel({ ...DEFAULTS.profile, goals: ['rock', 'funk'], minutesPerDay: 30 })).toBe('Goals: rock, funk · 30 min/day (change)');
    expect(rebuildNeedsConfirm({})).toBe(false);
    expect(rebuildNeedsConfirm({ session: { date: '2026-10-30', items: [], done: [] } })).toBe(false);
    expect(rebuildNeedsConfirm({ session: { date: '2026-10-30', items: [], done: [0] } })).toBe(true);
    expect(rebuildTodayPatch()).toEqual({ session: undefined });
    const profile = { ...DEFAULTS.profile, goals: ['jazz' as const], onboarded: true };
    expect(resetAllLessonsPatch(profile)).toEqual({ lessons: {}, session: undefined, profile: { ...profile, onboarded: false } });
  });
});

describe('skill map', () => {
  it('every skill with its mastery and 6 months of growth', () => {
    const rows = skillMapModel(CURRICULUM, {}, '2026-10-30', NOW.getTime());
    expect(rows.length).toBe(11);
    expect(rows[0]).toMatchObject({ id: 'time', name: 'Steady time', pct: 0, fill: 0.02, growth: [0, 0, 0, 0, 0, 0] });
    expect(rows.every(r => r.refresh === undefined)).toBe(true);
  });
});

describe("this month's report", () => {
  const report = { headline: 'A steadier month', better: ['Even 8ths'], next: ['The kick'], note: 'Keep it short and daily.' };
  it('turns a kept take into a chart of your own hits at its tempo (web YouVsYou hear)', () => {
    const take = { beatMs: 500, beats: 8, beatsPerBar: 4, timeSignature: [4, 4], hits: [[0, 'kick', 100], [500, 'snare', 120], [1000, 'bogus', 90], [750, 'hhClosed', 30], [4100, 'snare', 90]] };
    const c = keptTakeChart(take, 7, 'You, 3 Oct');
    expect(c).toMatchObject({ id: 'take-7', title: 'You, 3 Oct', bpm: 120, bars: 2, timeSignature: [4, 4] });
    expect(c!.notes.map(n => [n.t, n.drum, !!n.accent, !!n.ghost])).toEqual([[0, 'kick', false, false], [1, 'snare', true, false], [1.5, 'hihat', false, true]]);
    expect(keptTakeChart(null, 7, 'x')).toBeNull();
    expect(keptTakeChart({ beatMs: -1 }, 7, 'x')).toBeNull();
  });

  it('reads a kept report only for this month', () => {
    expect(keptReport({ month: '2026-10', report }, NOW)).toEqual(report);
    expect(keptReport({ month: '2026-09', report }, NOW)).toBeUndefined();
    expect(keptReport('junk', NOW)).toBeUndefined();
  });
  it('asks the server with the iPad context and keeps the answer', async () => {
    const call = vi.fn(async () => ({ ok: true as const, data: { data: report, cached: false, month: '2026-10' } }));
    const keep = vi.fn();
    const r = await askMonthReport({ call, context: async () => ({ runs: [] }), keep }, true, NOW);
    expect(r).toEqual({ ok: true, report });
    expect(call).toHaveBeenCalledWith('POST', '/api/coach/month', { again: true, context: { runs: [] } }, { timeoutMs: 200_000 });
    expect(keep).toHaveBeenCalledWith({ month: '2026-10', report });
  });
  it('the unreachable state, and an answer it cannot read', async () => {
    const keep = vi.fn();
    const off = await askMonthReport({ call: async () => ({ ok: false, reason: 'unreachable' }), context: async () => ({}), keep }, false, NOW);
    expect(off).toEqual({ ok: false, message: coachUnavailable({ reason: 'unreachable' }) });
    expect(coachUnavailable({ reason: 'not-configured' })).toContain('Setup → Coach');
    const bad = await askMonthReport({ call: async () => ({ ok: true, data: { nope: 1 } }), context: async () => { throw new Error('x'); }, keep }, false, NOW);
    expect(bad.ok).toBe(false);
    expect(keep).not.toHaveBeenCalled();
  });
  it('you vs you needs a kept take a month old; months fill in from the first take', () => {
    const old = run('singles', 70, 20, { id: 1, hasTake: true, startedAt: at(20, 18, 8) });
    const recent = run('singles', 90, 28, { id: 2, hasTake: true, spread: 10.4 });
    const h = historyModel([old, recent], NOW.getTime());
    expect(h.pair?.line).toBe('singles: 20 Sep vs 28 Oct.');
    expect(h.pair?.rows).toEqual([
      { label: 'A month ago', runId: 1, accuracy: '70%', spread: '15 ms', tempo: '80 BPM', title: 'You, 20 Sep' },
      { label: 'Now', runId: 2, accuracy: '90%', spread: '10 ms', tempo: '80 BPM', title: 'You, 28 Oct' },
    ]);
    expect(h.months.map(m => m.month)).toEqual(['2026-09', '2026-10']);
    expect(historyModel([recent], NOW.getTime())).toEqual({ pair: undefined, months: [] });
  });
});

describe('stored data', () => {
  it('reads runs, coach lessons and the plan from storage; a fresh iPad is empty', async () => {
    const store = createDataStore(() => openTestDb(), () => {});
    expect(await loadStoredData(store)).toEqual({ runs: [], lessons: CURRICULUM, plan: undefined, songs: [] });
    await store.runs.add({ chartId: 'singles', chartTitle: 'Single strokes (16ths)', startedAt: at(30), durationS: 60, bpm: 70, speed: 1, accuracy: 90, meanOffset: 2, spread: 12, summary: { notes: 32 } });
    const lesson = { ...CURRICULUM[1], id: 'coach-x', source: 'ai' };
    store.aiLessons!.put(lesson);
    store.plans!.add({ title: 'This week', week: '2026-W44', focus: 'even 8ths' });
    const d = await loadStoredData(store);
    expect(d.runs).toHaveLength(1);
    expect(d.runs[0].notes).toBe(32);
    expect(d.lessons.at(-1)?.id).toBe('coach-x');
    expect(d.plan).toEqual({ week: '2026-W44', focus: 'even 8ths' });
    expect(allLessons([{ id: 'broken' }, { ...CURRICULUM[0] }])).toHaveLength(CURRICULUM.length); // junk and duplicates are dropped
    store.songs!.add({ originalId: 'abcdefghijk', title: 'Song (Official Video)' });
    expect((await loadStoredData(store)).songs.map(x => x.id)).toEqual(['yt-abcdefghijk']);
    expect((await loadStoredData({ ...store, songs: { list: () => { throw new Error('no table'); } } })).songs).toEqual([]);
  });
});

describe('your fills (web ProgressView Coming up)', () => {
  it('newest first, with the line and a one-bar chart to hear; empty says where they come from', () => {
    expect(progressModel({ ...base, runs: [] }).fills).toEqual({ rows: [], empty: 'Fills you make up in free bars can be kept after the take. They land here.' });
    const notes = [{ t: 0, drum: 'snare' as const }, { t: 1, drum: 'tom1' as const }];
    const fills = [
      { id: 'a', at: '2026-10-09T18:00:00.000Z', bpm: 80, notes },
      { id: 'b', at: '2026-10-29T18:00:00.000Z', bpm: 92, timeSignature: [3, 4] as [number, 4], notes: [...notes, { t: 2, drum: 'kick' as const }] },
    ];
    const m = progressModel({ ...base, runs: [], fills });
    expect(m.fills.rows.map(f => f.line)).toEqual(['29 Oct · 3 notes · 92 BPM', '9 Oct · 2 notes · 80 BPM']);
    expect(m.fills.rows[1].chart).toEqual({ id: 'fill-a', title: 'Your fill', bpm: 80, timeSignature: [4, 4], bars: 1, notes });
    expect(m.fills.rows[0].chart.timeSignature).toEqual([3, 4]);
  });
});

describe('show-off set (web ProgressView: showoff, bestSongBars)', () => {
  // 4/4, 20 bars: the last note on beat 76 (bar 20)
  const song = (id: string, over: Partial<YtSong> = {}): YtSong => ({
    id, title: `${id} (Official Video)`, originalId: id.slice(3), drumlessId: null, coverId: null, timeSignature: [4, 4],
    notes: [{ t: 0, drum: 'kick' }, { t: 76, drum: 'snare' }], grids: {}, verifiedAt: '2026-10-20', ...over,
  });
  const songRun = (id: string, accuracy: number, fromBar: number, toBar: number) => run(id, accuracy, 29, { fromBar, toBar });

  it('no songs: the show-off trophy reads 0 / 16 bars and the set explains how to fill it', () => {
    const m = progressModel({ ...base, runs: [] });
    expect(m.trophies.later).toContain('Show-off song');
    expect(m.showoff.songs).toEqual([]);
    expect(m.showoff.empty).toMatch(/^Pass a stage, then play 16 bars/);
  });

  it('a song checked by ear with every bar at 85% lands in the set and earns the trophy; two make a concert', () => {
    const runs = [songRun('yt-a', 90, 1, 12), songRun('yt-a', 88, 13, 20), songRun('yt-b', 95, 1, 20), songRun('yt-c', 95, 1, 20)];
    const m = progressModel({ ...base, runs, songs: [song('yt-a'), song('yt-b'), song('yt-c', { verifiedAt: null })] });
    expect(m.showoff.songs).toEqual([{ id: 'yt-a', title: 'yt-a' }, { id: 'yt-b', title: 'yt-b' }]); // yt-c isn't checked by ear (N4)
    expect(m.showoff.concert).toEqual([{ id: 'yt-a', bars: { from: 1, to: 20 } }, { id: 'yt-b', bars: { from: 1, to: 20 } }]);
    expect(m.trophies.badges.map(b => b.id)).toContain('showoff');
  });

  it('bars ready count toward the trophy before a song is ready; one song makes no concert', () => {
    const m = progressModel({ ...base, runs: [songRun('yt-a', 90, 1, 6), songRun('yt-a', 70, 7, 20)], songs: [song('yt-a')] });
    expect(m.showoff.songs).toEqual([]);
    expect(m.trophies.badges.map(b => b.id)).not.toContain('showoff');
    expect(m.trophies.closest.find(b => b.id === 'showoff')?.words).toBe('6 / 16 bars');
    const one = progressModel({ ...base, runs: [songRun('yt-a', 90, 1, 20)], songs: [song('yt-a')] });
    expect(one.showoff.songs).toHaveLength(1);
    expect(one.showoff.concert).toBeUndefined();
  });
});
