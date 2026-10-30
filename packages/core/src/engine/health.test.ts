import { describe, expect, it } from 'vitest';
import { breakDue, dayAdvice, lighten, soreActive, STRETCH_ID } from './health';

describe('health and habits (N10)', () => {
  it('a break after about 22 minutes of playing in one sitting', () => {
    expect(breakDue(21 * 60)).toBe(false);
    expect(breakDue(22 * 60)).toBe(true);
  });
  it('practice-length advice: no marathon first week, and a nudge after an hour', () => {
    expect(dayAdvice(20, 3)).toBeUndefined();
    expect(dayAdvice(45, 3)).toMatch(/first week/);
    expect(dayAdvice(45, 30)).toBeUndefined();
    expect(dayAdvice(65, 30)).toMatch(/hour/);
  });
  it('sore: lighter days until the date (inclusive)', () => {
    expect(soreActive('2026-10-29', '2026-10-27')).toBe(true);
    expect(soreActive('2026-10-29', '2026-10-29')).toBe(true);
    expect(soreActive('2026-10-29', '2026-10-30')).toBe(false);
    expect(soreActive(undefined, '2026-10-27')).toBe(false);
  });
  it('a lighter day: the stretch, a review and one short lesson, no record attempts', () => {
    const items = [{ role: 'stretch' as const, lessonId: STRETCH_ID, minutes: 2 }, { role: 'warmup' as const, lessonId: 'w', minutes: 3 }, { role: 'review' as const, lessonId: 'r', minutes: 4 },
      { role: 'skill' as const, lessonId: 's', minutes: 9 }, { role: 'groove' as const, lessonId: 'g', minutes: 9 }, { role: 'record' as const, lessonId: 'x', minutes: 3 }];
    expect(lighten(items).map(i => `${i.role}:${i.minutes}`)).toEqual(['stretch:2', 'review:4', 'skill:5']);
  });
});
