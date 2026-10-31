// Lesson state lives in the app settings; runs are separate and never reset here. The helpers are core's
// (input/lessonState.ts), shared with the web's src/lesson/state.ts, on the lesson player's SettingsStore.
import { dayKey, type Lesson, type LessonProgress } from '@drum-coach/core/engine/lesson';
import { progressIn, resetLessonIn, saveProgressIn } from '@drum-coach/core/input/lessonState';
import type { SettingsStore } from './settings';

export const todayKey = (d = new Date()) => dayKey(d);
export const progressOf = (s: SettingsStore, l: Lesson): LessonProgress => progressIn(s, l);
export const saveProgress = (s: SettingsStore, id: string, p: LessonProgress) => saveProgressIn(s, id, p);
export const resetLesson = (s: SettingsStore, id: string) => resetLessonIn(s, id);
