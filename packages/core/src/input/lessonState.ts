import { startProgress, type Lesson, type LessonProgress } from '../engine/lesson.ts';
import type { Settings } from './settings.ts';

// A lesson's progress lives in the app settings (runs are separate and never reset here). One copy for the web
// (src/lesson/state.ts, on its settings module) and the iPad (features/lesson/progress.ts, on its settings store).

/** Read and write the app settings (the web's getSettings / setSettings, the iPad's SettingsStore). */
export type SettingsAccess = { get(): Settings; set(patch: Partial<Settings>): void };

/** Where a lesson stands: its saved progress, or a fresh start. */
export const progressIn = (s: SettingsAccess, l: Lesson): LessonProgress => s.get().lessons[l.id] ?? startProgress(l);

export const saveProgressIn = (s: SettingsAccess, id: string, p: LessonProgress) => s.set({ lessons: { ...s.get().lessons, [id]: p } });

/** Back to step 1 at the starting tempo: the lesson's progress goes (its saved runs stay). */
export function resetLessonIn(s: SettingsAccess, id: string) {
  const lessons = { ...s.get().lessons };
  delete lessons[id];
  s.set({ lessons });
}
