// A lesson the coach wrote (POST /api/coach/lesson), saved on the iPad. With the iPad's context the server doesn't
// touch its own table: it answers with `replaces`, the coach's unstarted lessons of that stage that the new one stands
// in for (server/index.ts), and the iPad drops them as the server does for the web, in one transaction with the new
// one. A lesson started while the coach was thinking is kept (the server's rule: only unstarted ones go). Pure.
import type { AiLesson, AiLessonsRepo } from '../../data/records';
import type { AnswerMeta } from '../coach/asks';

/** Saves the coach's lesson; returns false when the answer isn't a lesson. */
export function saveCoachLesson(repo: Pick<AiLessonsRepo, 'replace'> | null | undefined, lesson: unknown, meta: AnswerMeta, started: (id: string) => boolean): boolean {
  if (!repo || !lesson || typeof lesson !== 'object' || typeof (lesson as { id?: unknown }).id !== 'string') return false;
  const l = lesson as AiLesson;
  repo.replace(l, (meta.replaces ?? []).filter(id => id !== l.id && !started(id)));
  return true;
}
