import { CURRICULUM, MILESTONES } from '@drum-coach/core/content/curriculum';
import type { RunRow } from '@drum-coach/core/engine/progress';
import { DEFAULTS } from '@drum-coach/core/input/settings';
import { describe, expect, it } from 'vitest';
import { progressViewOf } from './path';
import { progressModel } from './progress';
import { planLine, youDoors } from './you';

const NOW = new Date(2026, 9, 30, 19, 0);
const base = { progress: {}, profile: DEFAULTS.profile, lessons: CURRICULUM, now: NOW };
const run = (day: number): RunRow => ({ chartId: 'lesson/count-quarters/1', chartTitle: 'Quarter notes', startedAt: new Date(2026, 9, day, 18).toISOString(),
  durationS: 600, bpm: 80, speed: 1, accuracy: 80, meanOffset: 5, spread: 15, notes: 40 });

describe('You (D10)', () => {
  it('six doors to the detail views, in the wireframe order', () => {
    const doors = youDoors(progressModel({ ...base, runs: [] }), undefined);
    expect(doors.map(d => [d.title, d.view])).toEqual([
      ['Path & skills', 'path'], ['Trophies', 'trophies'], ['Your lessons', 'lessons'], ['Coach’s week plan', 'plan'], ['Show-off & fills', 'coming'], ['Reports', 'reports'],
    ]);
    const stages = MILESTONES.filter(m => m.checkpoints.length).length;
    expect(doors[0].sub).toMatch(new RegExp(`^Stage 1 of \\d+ · skill map$`));
    expect(stages).toBeGreaterThan(1);
    expect(doors[1].sub).toMatch(/^0 earned · next: /);
    expect(doors[2].sub).toBe('0 · ★ 0');
    expect(doors[3].sub).toBe('not written yet');
    expect(doors[4].sub).toBe('0 songs · 0 fills');
    expect(doors.every(d => progressViewOf(d.view) === d.view)).toBe(true);
  });

  it('with takes: the lessons count; the chip and the stage; the focus says when it is the coach’s plan', () => {
    const m = progressModel({ ...base, runs: [run(28), run(29)], plan: { week: '2026-W44', focus: 'even 8ths' } });
    expect(youDoors(m, undefined)[2].sub).toBe('1 · ★ 0');
    expect(m.week.rankShort).toBe('New drummer · Stage 1');
    expect(m.week).toMatchObject({ focus: 'even 8ths', focusFromPlan: true });
  });

  it("the plan door: the days it covers and its lessons", () => {
    expect(planLine({ days: [{ day: 'Monday', items: [] }, { day: 'Sunday', items: [] }], lessonIds: ['a', 'b', 'c'] })).toBe('Mon–Sun · 3 lessons');
    expect(planLine({ days: [{ day: 'Tuesday', items: [] }], focus: 'kick' })).toBe('Tue · focus: kick');
    expect(planLine({})).toBe('this week');
  });
});
