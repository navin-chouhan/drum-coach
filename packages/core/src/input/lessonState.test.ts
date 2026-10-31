import { describe, expect, it } from 'vitest';
import { LESSON_BY_ID } from '../content/curriculum';
import { startProgress } from '../engine/lesson';
import { progressIn, resetLessonIn, saveProgressIn, type SettingsAccess } from './lessonState';
import { DEFAULTS, type Settings } from './settings';

const store = (): SettingsAccess & { s: Settings } => {
  const x = { s: { ...DEFAULTS, lessons: {} }, get: () => x.s, set: (p: Partial<Settings>) => { x.s = { ...x.s, ...p }; } };
  return x;
};
const money = LESSON_BY_ID['money-8ths'];

describe('lesson progress in the settings (web state.ts, iPad progress.ts)', () => {
  it('a fresh start until saved; saving keeps the other lessons; reset forgets only this one', () => {
    const st = store();
    expect(progressIn(st, money)).toEqual(startProgress(money));
    saveProgressIn(st, 'other', { ...startProgress(money), bpm: 99 });
    saveProgressIn(st, money.id, { ...startProgress(money), step: 2, bpm: 75 });
    expect(progressIn(st, money)).toMatchObject({ step: 2, bpm: 75 });
    expect(st.s.lessons.other.bpm).toBe(99);
    resetLessonIn(st, money.id);
    expect(progressIn(st, money)).toEqual(startProgress(money));
    expect(Object.keys(st.s.lessons)).toEqual(['other']);
  });
});
