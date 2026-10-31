import type { Lesson, LessonProgress } from './lesson.ts';

// Which lesson "Just jam" and "Flow" open (the web's TodayView; the iPad's Journey and /flow). Pure.

/** The jam: the newest visible lesson with a jam step, up to the current stage (all stages after the path). */
export const jamLesson = (visible: Lesson[], stageLevel?: number): Lesson | undefined =>
  [...visible].reverse().find(l => l.level <= (stageLevel ?? 99) && l.steps.some(st => st.jam));

/** Flow on the newest finished groove (the highest stage, the latest finished), not the first jam forever; else the jam. */
export function flowLesson(visible: Lesson[], progress: Record<string, LessonProgress | undefined>, jam: Lesson | undefined): Lesson | undefined {
  const done = (id: string) => !!progress[id]?.completedAt;
  return visible.filter(l => done(l.id) && l.kind === 'groove').sort((a, b) => b.level - a.level || progress[b.id]!.completedAt!.localeCompare(progress[a.id]!.completedAt!))[0] ?? jam;
}
