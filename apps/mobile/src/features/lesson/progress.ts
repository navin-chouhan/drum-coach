// Copied from src/lesson/state.ts (progressOf / saveProgress / resetLesson / today), for a later move to core: lesson
// state lives in the app settings; runs are separate and never reset here.
import { dayKey, startProgress, type Lesson, type LessonProgress } from '@drum-coach/core/engine/lesson';
import type { SettingsStore } from './settings';

export const todayKey = (d = new Date()) => dayKey(d);
export const progressOf = (s: SettingsStore, l: Lesson): LessonProgress => s.get().lessons[l.id] ?? startProgress(l);
export const saveProgress = (s: SettingsStore, id: string, p: LessonProgress) => s.set({ lessons: { ...s.get().lessons, [id]: p } });
export function resetLesson(s: SettingsStore, id: string) {
  const lessons = { ...s.get().lessons };
  delete lessons[id];
  s.set({ lessons });
}
