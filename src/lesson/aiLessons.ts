import { useSyncExternalStore } from 'react';
import { askCoach } from '../coach/api';
import { CURRICULUM, LESSON_BY_ID } from '../content/curriculum';
import type { Lesson } from '../engine/lesson';

// Lessons the coach wrote for this student (stored in SQLite). Built-in lessons are the fallback.
let ai: Lesson[] = [];
let all: Lesson[] = CURRICULUM;
const listeners = new Set<() => void>();
const set = (list: Lesson[]) => { ai = list; all = [...CURRICULUM, ...ai]; listeners.forEach(l => l()); };

export async function refreshAiLessons() {
  try { const r = await fetch('/api/lessons'); if (r.ok) set(await r.json()); } catch { /* server down: built-ins still work */ }
}
export const allLessons = () => all;
export const lessonById = (id: string): Lesson | undefined => LESSON_BY_ID[id] ?? ai.find(l => l.id === id);
export const useLessons = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, allLessons);

/** Ask the coach to write the next lesson for the current milestone (optionally about a failed take). */
export function requestCoachLesson(key: string, struggle?: { lessonId: string; step: number; reason: string; run: Record<string, unknown> }) {
  askCoach<Lesson>(key, 'lesson', { struggle }, () => void refreshAiLessons());
}
export async function deleteCoachLesson(id: string) {
  await fetch(`/api/lessons/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  await refreshAiLessons();
}
