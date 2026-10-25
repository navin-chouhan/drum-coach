import { describe, expect, it } from 'vitest';
import { addDays, afterReview, checkPass, dueReviews, ladderStep, starsFor, startProgress, type Lesson, type LessonProgress } from './lesson';
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
  velocity: { normalMean: 90, normalCv: 8, accentMean: null, ghostMean: null, pairDrop: null }, flam: null, heat: [], ...o,
});

describe('checkPass', () => {
  it('passes a clean take and explains failures', () => {
    expect(checkPass(stats()).ok).toBe(true);
    const snare = { total: 12, hit: 12, accuracy: 100, meanOffset: 0 };
    expect(checkPass(stats({ accuracy: 80, perDrum: { snare, kick: { total: 8, hit: 4, accuracy: 50, meanOffset: 30 } } })))
      .toEqual({ ok: false, reason: expect.stringMatching(/80%.*kick.*late by 30/) });
    expect(checkPass(stats({ accuracy: 50, perDrum: { snare: { ...snare, accuracy: 50, meanOffset: -25 } } })).reason)
      .toMatch(/^(?!.*weakest).*early by 25/); // one drum: no "weakest"
    expect(checkPass(stats({ extra: 5 })).ok).toBe(false);
    expect(checkPass(stats({ meanOffset: -40 }), { maxAbsOffsetMs: 30 }).reason).toMatch(/Rushing by 40/);
    expect(checkPass(stats(), { maxVelocityCv: 5 }).ok).toBe(false);
    expect(checkPass(stats({ velocity: { normalMean: 96, normalCv: 0, accentMean: 127, ghostMean: null, pairDrop: null } }), { maxGhostToAccent: 0.8 }).ok).toBe(true);
    expect(checkPass(stats({ velocity: { normalMean: 96, normalCv: 0, accentMean: 127, ghostMean: 96, pairDrop: null } }), { maxGhostToAccent: 0.6 }).ok).toBe(false);
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
  it('three fails → −5 BPM, never below the start', () => {
    expect(play([false, false, false]).events).toEqual(['hold', 'hold', 'hold']);
    const r = ladderStep({ ...p0, bpm: 65, fails: 2 }, lesson, false, D);
    expect(r).toMatchObject({ event: 'slowDown', next: { bpm: 60, fails: 0 } });
  });
  it('finishing the last step completes the lesson and schedules a review', () => {
    const r = play([true, true, true, true, true, true]);
    expect(r.events.at(-1)).toBe('lessonDone');
    expect(r.p).toMatchObject({ completedAt: D, reviewDue: '2026-10-26', reviewStage: 0, bestBpm: 70 });
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
