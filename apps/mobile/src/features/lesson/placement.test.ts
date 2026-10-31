import { describe, expect, it } from 'vitest';
import { LESSON_BY_ID, MILESTONES } from '@drum-coach/core/content/curriculum';
import type { RunStats } from '@drum-coach/core/engine/scoring';
import { allLessons } from '../journey/source';
import { judgePlacement, ladderOf, placeAt, placementStep, rungLine } from './placement';

const lessons = allLessons([]);
const ladder = ladderOf(lessons, MILESTONES);
const byId = (id: string) => LESSON_BY_ID[id];

describe('the placement test (the web\'s PlacementView)', () => {
  it('has one challenge per stage, in path order', () => {
    expect(ladder.length).toBe(MILESTONES.filter(m => m.checkpoints.some(c => byId(c))).length);
    expect(ladder.map(r => r.level)).toEqual([...ladder.map(r => r.level)].sort((a, b) => a - b));
    expect(MILESTONES[0].checkpoints).toContain(ladder[0].lessonId);
  });
  it('plays the challenge\'s last step at its target tempo, about 4 bars, with hints', () => {
    const l = byId(ladder[0].lessonId), step = l.steps[l.steps.length - 1];
    const { options } = placementStep(l);
    expect(options).toMatchObject({ fromBar: 1, toBar: step.chart.bars, speed: step.bpm.target / step.chart.bpm, countInBars: 1, wait: false, hints: true });
    expect(options.repeats * step.chart.bars).toBeGreaterThanOrEqual(4);
    expect(rungLine(0, ladder.length, l)).toBe(`Stage 1 of ${ladder.length}: one take of ${l.title} at ${step.bpm.target} BPM. Pass it and we try the next stage.`);
  });
  it('passes a clean take and not a rough one', () => {
    const l = byId(ladder[0].lessonId);
    const clean = { total: 16, perfect: 16, good: 0, ok: 0, miss: 0, extra: 0, accuracy: 100, meanOffset: 0, spread: 5, perDrum: {}, streak: 16, recoveries: 0, heat: [], flam: null } as unknown as RunStats;
    const rough = { ...clean, perfect: 4, miss: 12, accuracy: 25, streak: 4 };
    expect(judgePlacement(clean, l)).toEqual({ ok: true, line: `${l.title}: 16 of 16 notes landed, passed.` });
    expect(judgePlacement(rough, l)).toMatchObject({ ok: false, line: `${l.title}: 4 of 16 notes landed.` });
  });
  it('starting at a stage passes every challenge below it (one star), keeps what was done and plans today again', () => {
    const second = MILESTONES[1], first = MILESTONES[0];
    const keep = first.checkpoints[0];
    const old = { [keep]: { step: 0, bpm: 60, completedAt: '2026-01-01', stars: 3 } } as never;
    const r = placeAt(second.level, MILESTONES, old, byId, '2026-10-31');
    expect(r.result).toBe(`You start at stage 2: ${second.title}.`);
    expect(r.patch.session).toBeUndefined();
    expect('session' in r.patch).toBe(true);
    expect(r.patch.lessons[keep]).toMatchObject({ completedAt: '2026-01-01', stars: 3 });
    for (const id of first.checkpoints.slice(1)) expect(r.patch.lessons[id]).toMatchObject({ completedAt: '2026-10-31', stars: 1 });
    for (const id of second.checkpoints) expect(r.patch.lessons[id]).toBeUndefined();
    expect(placeAt(Infinity, MILESTONES, {}, byId, 'd').result).toBe('You passed every stage. Impressive!');
    expect(placeAt(first.level, MILESTONES, {}, byId, 'd').patch.lessons).toEqual({});
  });
});
