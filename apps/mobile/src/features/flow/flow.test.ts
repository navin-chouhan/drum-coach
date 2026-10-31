import { describe, expect, it } from 'vitest';
import { CURRICULUM } from '@drum-coach/core/content/curriculum';
import { DEFAULTS } from '@drum-coach/core/input/settings';
import type { LessonProgress } from '@drum-coach/core/engine/lesson';
import { flowTile } from './flow';

const doneOn = (completedAt: string) => ({ step: 0, bpm: 80, clean: 0, fails: 0, bestBpm: 80, reviewStage: 0, completedAt }) as LessonProgress;

describe('Flow (web TodayView flowLesson)', () => {
  it('nothing finished: the jam lesson, "play along, no score"', () => {
    const t = flowTile(CURRICULUM, { lessons: {}, profile: DEFAULTS.profile });
    const jam = CURRICULUM.find(l => l.id === t?.lessonId)!;
    expect(jam.steps.some(s => s.jam)).toBe(true);
    expect(t?.sub).toBe('play along, no score');
  });

  it('the newest finished groove: the highest stage first, then the latest finished', () => {
    const lessons = { 'money-quarters': doneOn('2026-10-01'), 'money-8ths': doneOn('2026-10-20'), 'four-floor': doneOn('2026-10-10') };
    expect(flowTile(CURRICULUM, { lessons, profile: DEFAULTS.profile })).toEqual({ lessonId: 'money-8ths', sub: 'The money beat' });
    const higher = { ...lessons, 'kick-and3': doneOn('2026-09-01') };
    expect(flowTile(CURRICULUM, { lessons: higher, profile: DEFAULTS.profile })?.lessonId).toBe('kick-and3');
  });
});
