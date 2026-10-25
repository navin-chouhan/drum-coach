import { describe, expect, it } from 'vitest';
import { addDays, afterReview, autoProbe, checkPass, clickOnBeat, probeTempo, copyChart, countPlan, pickVariant, playChart, recordTarget, dueReviews, ladderStep, lanesNow, starsFor, startProgress, type Lesson, type LessonProgress } from './lesson';
import type { RunStats } from './scoring';

const chart = { title: 't', bpm: 80, timeSignature: [4, 4] as [number, 4], bars: 1, notes: [{ t: 0, drum: 'snare' as const }] };
const lesson: Lesson = { id: 'l', level: 0, kind: 'groove', title: 'L', what: '', why: '', how: '', steps: [
  { title: 'a', text: '', chart, bpm: { start: 60, target: 65 } },
  { title: 'b', text: '', chart, bpm: { start: 70, target: 70 } },
] };
const D = '2026-10-24';

const stats = (o: Partial<RunStats> = {}): RunStats => ({
  total: 20, perfect: 18, good: 1, miss: 1, extra: 0, accuracy: 95, meanOffset: 5, spread: 10,
  perDrum: { snare: { total: 20, hit: 19, accuracy: 95, meanOffset: 5 } },
  velocity: { normalMean: 90, normalCv: 8, accentMean: null, ghostMean: null, pairDrop: null }, flam: null, heat: [], streak: 10, recoveries: 1, ...o,
});

describe('checkPass', () => {
  it('passes a clean take and explains failures', () => {
    expect(checkPass(stats()).ok).toBe(true);
    const snare = { total: 12, hit: 12, accuracy: 100, meanOffset: 0 };
    expect(checkPass(stats({ accuracy: 80, perDrum: { snare, kick: { total: 8, hit: 4, accuracy: 50, meanOffset: 30 } } })))
      .toEqual({ ok: false, reason: expect.stringMatching(/kick.*late by 30/) });
    expect(checkPass(stats({ accuracy: 50, perDrum: { snare: { ...snare, accuracy: 50, meanOffset: -25 } } })).reason)
      .toMatch(/^(?!.*weakest).*early by 25/); // one drum: no "weakest"
    expect(checkPass(stats({ extra: 5 })).ok).toBe(false);
    expect(checkPass(stats({ meanOffset: -40 }), { maxAbsOffsetMs: 30 }).reason).toMatch(/Rushing by 40/);
    expect(checkPass(stats(), { maxVelocityCv: 5 }).ok).toBe(false);
    expect(checkPass(stats({ velocity: { normalMean: 96, normalCv: 0, accentMean: 127, ghostMean: null, pairDrop: null } }), { maxGhostToAccent: 0.8 }).ok).toBe(true);
    expect(checkPass(stats({ velocity: { normalMean: 96, normalCv: 0, accentMean: 127, ghostMean: 96, pairDrop: null } }), { maxGhostToAccent: 0.6 }).ok).toBe(false);
  });

  it('the bar follows the level, and a lesson may relax it but not tighten it', () => {
    expect(checkPass(stats({ accuracy: 77 }), undefined, 0).ok).toBe(true);
    expect(checkPass(stats({ accuracy: 77 }), { accuracy: 90 }, 0).ok).toBe(true);
    expect(checkPass(stats({ accuracy: 70 }), { accuracy: 65 }, 0).ok).toBe(true);
    expect(checkPass(stats({ accuracy: 77 }), undefined, 2).ok).toBe(false);
    expect(checkPass(stats({ accuracy: 88 }), undefined, 6).ok).toBe(false);
    expect(checkPass(stats({ extra: 6 }), undefined, 0).ok).toBe(true); // 30% extra: ignored at level 0
  });
  it('a streak challenge replaces the accuracy bar', () => {
    expect(checkPass(stats({ accuracy: 60, streak: 8 }), { streak: 8 }, 0).ok).toBe(true);
    expect(checkPass(stats({ accuracy: 99, streak: 5 }), { streak: 8 }, 0).reason).toMatch(/5 in a row, aiming for 8/);
  });

  it('spread, flam and weak doubles fail with one plain reason', () => {
    expect(checkPass(stats({ spread: 45 }), { maxSpreadMs: 40 }).reason).toMatch(/wander ±45 ms/);
    expect(checkPass(stats({ spread: 30 }), { maxSpreadMs: 40 }).ok).toBe(true);
    expect(checkPass(stats({ flam: 40 }), { maxFlamMs: 25 }).reason).toMatch(/split by 40 ms/);
    expect(checkPass(stats(), { maxFlamMs: 25 }).ok).toBe(true); // nothing landing together: no check
    const v = stats().velocity;
    expect(checkPass(stats({ velocity: { ...v, pairDrop: 30 } }), { maxPairDropPct: 15 }).reason).toMatch(/30% softer/);
  });
});

describe('tempo ladder', () => {
  const p0 = startProgress(lesson);
  const play = (results: boolean[]) => results.reduce<{ p: typeof p0; events: string[] }>(
    (acc, ok) => { const r = ladderStep(acc.p, lesson, ok, D); return { p: r.next, events: [...acc.events, r.event] }; }, { p: p0, events: [] });

  it('two clean takes → +5 BPM, capped at the target, then the next step', () => {
    const r = play([true, true, true, true]);
    expect(r.events).toEqual(['hold', 'up', 'hold', 'stepDone']);
    expect(r.p).toMatchObject({ step: 1, bpm: 70 });
  });
  it('a fail in between resets the clean count', () => {
    expect(play([true, false, true]).p).toMatchObject({ bpm: 60, clean: 1 });
  });
  it('two close misses → −5 BPM; a rough take → −10 at once; below the start tempo is fine down to 40', () => {
    expect(play([false]).events).toEqual(['hold']);
    expect(ladderStep({ ...p0, bpm: 60, fails: 1 }, lesson, false, D, 70)).toMatchObject({ event: 'slowDown', next: { bpm: 55, fails: 0 } });
    expect(ladderStep({ ...p0, bpm: 60 }, lesson, false, D, 40)).toMatchObject({ event: 'slowDown', next: { bpm: 50 } });
    expect(ladderStep({ ...p0, bpm: 45 }, lesson, false, D, 40)).toMatchObject({ next: { bpm: 40 } });
    expect(ladderStep({ ...p0, bpm: 40 }, lesson, false, D, 40)).toMatchObject({ event: 'atFloor', next: { bpm: 40 } });
  });
  it('after easing off, one clean take climbs +10 back toward the target', () => {
    expect(ladderStep({ ...p0, bpm: 45 }, lesson, true, D)).toMatchObject({ event: 'up', next: { bpm: 55 } });
    expect(ladderStep({ ...p0, bpm: 55 }, lesson, true, D)).toMatchObject({ event: 'up', next: { bpm: 65 } });
  });
  it('layers: each clean take adds a limb at the same tempo, a fail keeps the layer, then the ladder', () => {
    const lay: Lesson = { ...lesson, steps: [{ ...lesson.steps[0], layers: [['hihat'], ['hihat', 'kick'], ['hihat', 'kick', 'snare']] }, lesson.steps[1]] };
    const p = startProgress(lay);
    expect(ladderStep(p, lay, true, D)).toMatchObject({ event: 'layerUp', next: { layer: 1, bpm: 60 } });
    expect(ladderStep({ ...p, layer: 1 }, lay, false, D, 40)).toMatchObject({ next: { layer: 1, bpm: 50 } });
    expect(ladderStep({ ...p, layer: 2 }, lay, true, D).event).toBe('hold'); // last layer: the usual ladder
    expect(ladderStep({ ...p, layer: 2, bpm: 65, clean: 1 }, lay, true, D)).toMatchObject({ event: 'stepDone', next: { step: 1, layer: 0 } });
    expect(lanesNow(lay.steps[0], { ...p, layer: 1 })).toEqual(['hihat', 'kick']);
    expect(lanesNow(lesson.steps[0], p)).toBeUndefined();
  });
  it('free bars and trade count any take, unless the step sets a pass bar', () => {
    const free: Lesson = { ...lesson, steps: [{ ...lesson.steps[0], freeBars: [2] }, lesson.steps[1]] };
    expect(ladderStep(startProgress(free), free, false, D, 30).event).toBe('hold'); // first clean take of two
    const strict: Lesson = { ...lesson, steps: [{ ...lesson.steps[0], trade: true, pass: { accuracy: 80 } }, lesson.steps[1]] };
    expect(ladderStep(startProgress(strict), strict, false, D, 30).event).toBe('slowDown');
  });
  it('a ★★★ take counts as both clean takes; a streak challenge needs one', () => {
    expect(ladderStep(p0, lesson, true, D, 100, true)).toMatchObject({ event: 'up', next: { bpm: 65 } });
    expect(ladderStep({ ...p0, bpm: 65 }, lesson, true, D, 100, true)).toMatchObject({ event: 'stepDone', next: { step: 1 } });
    const ch: Lesson = { ...lesson, steps: [{ ...lesson.steps[0], bpm: { start: 60, target: 60 }, pass: { streak: 8 } }, lesson.steps[1]] };
    expect(ladderStep(startProgress(ch), ch, true, D)).toMatchObject({ event: 'stepDone', next: { step: 1 } });
  });
  it('a flying student finds their tempo on drill steps with a ladder; everyone else climbs from the start', () => {
    const drill = lesson.steps[0]; // 60 → 65
    expect(autoProbe(drill, 'flying')).toBe(true);
    expect(autoProbe(drill, 'steady')).toBe(false);
    expect(autoProbe({ ...drill, bpm: { start: 60, target: 60 } }, 'flying')).toBe(false); // nothing to climb
    expect(autoProbe({ ...drill, copy: true }, 'flying')).toBe(false); // other tools keep their own flow
    expect(autoProbe({ ...drill, layers: [['snare']] }, 'flying')).toBe(false);
  });
  it('a jam step counts any take and moves on', () => {
    const jam: Lesson = { ...lesson, steps: lesson.steps.map(s => ({ ...s, jam: true })) };
    expect(ladderStep(startProgress(jam), jam, false, D, 20)).toMatchObject({ event: 'stepDone', next: { step: 1, bpm: 70 } });
    expect(ladderStep({ ...startProgress(jam), step: 1, bpm: 70 }, jam, false, D).event).toBe('lessonDone');
  });
  it('finishing the last step completes the lesson and schedules a review', () => {
    const r = play([true, true, true, true, true, true]);
    expect(r.events.at(-1)).toBe('lessonDone');
    expect(r.p).toMatchObject({ completedAt: D, reviewDue: '2026-10-26', reviewStage: 0, bestBpm: 70 });
  });
});

describe('beat your best', () => {
  const quarters = { ...chart, bars: 1, notes: [0, 1, 2, 3].map(t => ({ t, drum: 'snare' as const })) }; // 32 notes in 8 bars
  const s = { title: 's', text: '', chart: quarters, bpm: { start: 60, target: 60 }, pass: { streak: 8 } };
  const p = startProgress({ ...lesson, steps: [s] });
  it('asks for 4 more in a row, capped at the notes in the take', () => {
    expect(recordTarget(s, p)).toBe(12);
    expect(recordTarget(s, { ...p, bestStreak: 30 })).toBe(32);
    expect(recordTarget(s, { ...p, bestStreak: 32 })).toBe(32); // the whole take: Journey stops offering it
    expect(recordTarget({ ...s, pass: undefined }, p)).toBeUndefined();
  });
});

describe('playChart', () => {
  it('trade: calls by the app, every echo bar free and empty', () => {
    const { chart: c, freeBars } = playChart({ chart: { ...chart, bars: 2, notes: [{ t: 0, drum: 'snare' }, { t: 4, drum: 'kick' }] }, trade: true });
    expect(freeBars).toEqual([2, 4]);
    expect(c.notes).toEqual([{ t: 0, drum: 'snare', auto: true }, { t: 8, drum: 'kick', auto: true }]);
  });
});

describe('click feel, variants and rest', () => {
  it('2and4 clicks only on beats 2 and 4', () => {
    expect([0, 1, 2, 3].map(b => clickOnBeat(b, '2and4'))).toEqual([false, true, false, true]);
    expect([0, 1, 2, 3].every(b => clickOnBeat(b))).toBe(true);
  });
  it('a variant is stable per take and the takes visit more than one', () => {
    expect(pickVariant(3, 5)).toBe(pickVariant(3, 5));
    expect(new Set(Array.from({ length: 12 }, (_, t) => pickVariant(3, t))).size).toBeGreaterThan(1);
    expect(Array.from({ length: 12 }, (_, t) => pickVariant(3, t)).every(v => v >= 0 && v < 3)).toBe(true);
  });
  it('a rest step is done when the rest is over', () => {
    const rest: Lesson = { ...lesson, steps: [{ ...lesson.steps[0], rest: 20 }, lesson.steps[1]] };
    expect(ladderStep(startProgress(rest), rest, false, D).event).toBe('stepDone'); // fresh: one "done", no tempo ladder
  });
});

describe('find your tempo', () => {
  it('works 10 below the bar that fell apart, or at the last tempo', () => {
    expect(probeTempo([100, 95, 90, 60], 60, 75)).toBe(65); // broke at 75 BPM
    expect(probeTempo([100, 100, 100], 60, 75)).toBe(70);
    expect(probeTempo([50], 45, 75)).toBe(40); // never under 40
  });
});

describe('countPlan', () => {
  it('counts every bar for 4 bars, then only "one"', () => {
    const p = countPlan(6, 4, '8ths');
    expect(p[0]).toEqual(['one', 'and', 'two', 'and', 'three', 'and', 'four', 'and']);
    expect(p[4]).toEqual(['one', '', '', '', '', '', '', '']);
    expect(countPlan(1, 3, 'quarters')).toEqual([['one', 'two', 'three']]);
  });
});

describe('copyChart', () => {
  it('turns each bar into a call (played by the app) and an echo', () => {
    const c = copyChart({ ...chart, bars: 2, notes: [{ t: 0, drum: 'snare' }, { t: 4, drum: 'kick' }] });
    expect(c.bars).toBe(4);
    expect(c.notes).toEqual([{ t: 0, drum: 'snare', auto: true }, { t: 4, drum: 'snare' }, { t: 8, drum: 'kick', auto: true }, { t: 12, drum: 'kick' }]);
  });
});

describe('spaced review', () => {
  it('passes push the review out 5, 12, 30, 30 days; a fail brings it back tomorrow', () => {
    let p: LessonProgress = { ...startProgress(lesson), completedAt: D, reviewDue: addDays(D, 2) };
    const dues: string[] = [];
    for (let i = 0; i < 4; i++) { p = afterReview(p, true, D); dues.push(p.reviewDue!); }
    expect(dues).toEqual(['2026-10-29', '2026-11-05', '2026-11-23', '2026-11-23']);
    expect(afterReview(p, false, D)).toMatchObject({ reviewStage: 0, reviewDue: '2026-10-25' });
  });
  it('lists due lessons oldest first', () => {
    const base = startProgress(lesson);
    expect(dueReviews({
      a: { ...base, completedAt: D, reviewDue: '2026-10-24' },
      b: { ...base, completedAt: D, reviewDue: '2026-10-20' },
      c: { ...base, completedAt: D, reviewDue: '2026-10-30' },
      d: { ...base },
    }, D)).toEqual(['b', 'a']);
  });
  it('addDays crosses months', () => expect(addDays('2026-10-30', 3)).toBe('2026-11-02'));
});

describe('starsFor', () => {
  it('gives one to three stars at the boundaries', () => {
    expect(starsFor(stats({ accuracy: 94 }))).toBe(1);
    expect(starsFor(stats({ accuracy: 95, extra: 1 }))).toBe(2);
    expect(starsFor(stats({ accuracy: 95, extra: 2 }))).toBe(1); // 10% extra
    expect(starsFor(stats({ accuracy: 98, perfect: 14 }))).toBe(3); // 70% perfect
    expect(starsFor(stats({ accuracy: 98, perfect: 13 }))).toBe(2);
    expect(starsFor(stats({ accuracy: 100, perfect: 20, extra: 1 }))).toBe(2); // 5% extra is too many for three
    expect(starsFor(stats({ accuracy: 100, perfect: 20, spread: 20 }))).toBe(2); // hits wandering ±20 ms is not three
  });
});

describe('reacting to the click', () => {
  it('fails the take with that as the one thing to fix, before accuracy', () => {
    expect(checkPass(stats({ reaction: 180, accuracy: 60 })).reason).toMatch(/after each click/);
    expect(checkPass(stats({ reaction: null })).ok).toBe(true);
  });
});
