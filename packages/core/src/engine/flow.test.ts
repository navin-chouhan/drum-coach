import { describe, expect, it } from 'vitest';
import { CURRICULUM } from '../content/curriculum';
import { flowLesson, jamLesson } from './flow';
import type { LessonProgress } from './lesson';

const doneOn = (completedAt: string) => ({ step: 0, bpm: 80, clean: 0, fails: 0, bestBpm: 80, reviewStage: 0, completedAt }) as LessonProgress;

describe('jam and flow lessons (web TodayView)', () => {
  it('the jam: the newest jam lesson up to the stage, any stage without one', () => {
    const atZero = jamLesson(CURRICULUM, 0)!;
    expect(atZero.level).toBe(0);
    expect(atZero.steps.some(s => s.jam)).toBe(true);
    const any = jamLesson(CURRICULUM)!;
    expect(any.level).toBeGreaterThanOrEqual(atZero.level);
    expect(jamLesson([], 3)).toBeUndefined();
  });

  it('flow: the highest stage\'s finished groove, the latest finished on a tie; else the jam', () => {
    const jam = jamLesson(CURRICULUM, 0);
    expect(flowLesson(CURRICULUM, {}, jam)).toBe(jam);
    const p = { 'money-quarters': doneOn('2026-10-01'), 'money-8ths': doneOn('2026-10-20'), 'four-floor': doneOn('2026-10-10') };
    expect(flowLesson(CURRICULUM, p, jam)?.id).toBe('money-8ths');
    expect(flowLesson(CURRICULUM, { ...p, 'kick-and3': doneOn('2026-09-01') }, jam)?.id).toBe('kick-and3');
    expect(flowLesson(CURRICULUM, { 'ear-steady': doneOn('2026-10-01') }, undefined)).toBeUndefined(); // not a groove
  });
});
