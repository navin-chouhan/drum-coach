import { useSyncExternalStore } from 'react';
import { askCoach } from '../coach/api';
import { CURRICULUM, LESSON_BY_ID } from '../content/curriculum';
import type { Lesson } from '../engine/lesson';
import { songChart } from '../engine/transcribe';
import type { YtSong } from '../youtube/schemas';

// Lessons the coach wrote for this student (stored in SQLite). Built-in lessons are the fallback.
let ai: Lesson[] = [];
let all: Lesson[] = CURRICULUM;
let loaded = false; // until the server's list arrives, "no coach lesson" isn't known yet
let stitched: Lesson | undefined; // the stage's song, played all the way through (built here, never stored)
const listeners = new Set<() => void>();
const set = (list: Lesson[]) => { ai = list; all = [...CURRICULUM, ...ai]; listeners.forEach(l => l()); }; // the stitched song is only opened by id

export async function refreshAiLessons() {
  try { const r = await fetch('/api/lessons'); if (r.ok) { const list = await r.json(); loaded = true; set(list); } } catch { /* server down: built-ins still work */ }
}
export const allLessons = () => all;
export const aiLessonsLoaded = () => loaded;
export const lessonById = (id: string): Lesson | undefined => LESSON_BY_ID[id] ?? ai.find(l => l.id === id) ?? (stitched?.id === id ? stitched : undefined);

/** Stitch the song: once every bar of the project song is ready, a lesson that plays it all the way through. */
export function stitchLesson(song: YtSong, level: number): Lesson {
  const chart = songChart(song), id = `song-${song.id}`;
  return { id, level, kind: 'song', title: `Song: ${song.title}`,
    what: 'The whole song, start to finish, on the app\'s drums.', why: 'Every bar is ready. Put them together, then play it with the real song.',
    how: 'Start slower than the song; two clean takes and the tempo goes up until it matches the record.',
    steps: [{ title: 'All the way through', text: 'Play the whole song. Keep going if you slip: the next bar is a fresh start.', chart: { ...chart, id: `lesson/${id}/1` },
      bpm: { start: Math.round(chart.bpm * 0.75), target: chart.bpm } }] };
}
export function setStitched(l: Lesson | undefined) {
  if (l?.id === stitched?.id && l?.steps[0].chart.notes.length === stitched?.steps[0].chart.notes.length) return;
  stitched = l; set(ai);
}
export const useLessons = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, allLessons);

/** Ask the coach to write the next lesson for the current milestone (optionally about a failed take). */
export function requestCoachLesson(key: string, struggle?: { lessonId: string; step: number; reason: string; run: Record<string, unknown> }) {
  askCoach<Lesson>(key, 'lesson', { struggle }, () => void refreshAiLessons());
}
export async function deleteCoachLesson(id: string) {
  await fetch(`/api/lessons/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  await refreshAiLessons();
}
