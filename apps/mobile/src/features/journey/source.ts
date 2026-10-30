// Where Journey's data comes from on the iPad (D3: the device is the source of truth): the app settings in the
// key-value store (profile, lesson progress, today's set), the runs table, the coach's lessons and weekly plan.
// The pure parts are here; useJourney.ts reads Storage with them.
import { CURRICULUM } from '@drum-coach/core/content/curriculum';
import type { Lesson } from '@drum-coach/core/engine/lesson';
import { isoWeek } from '@drum-coach/core/engine/progress';
import type { Session, Settings } from '@drum-coach/core/input/settings';

/** The built-in path plus the coach's stored lessons (anything that isn't a lesson with steps is skipped). */
export function allLessons(ai: unknown[]): Lesson[] {
  const known = new Set(CURRICULUM.map(l => l.id));
  const coach = ai.filter((l): l is Lesson => !!l && typeof l === 'object' && typeof (l as Lesson).id === 'string'
    && Array.isArray((l as Lesson).steps) && (l as Lesson).steps.length > 0 && !known.has((l as Lesson).id));
  return [...CURRICULUM, ...coach];
}

/** This week's lessons from the coach's latest plan (R6), when the plan is for this ISO week. */
export function planFocus(plan: Record<string, unknown> | undefined, now: Date): string[] | undefined {
  if (!plan || plan.week !== isoWeek(now) || !Array.isArray(plan.lessonIds)) return undefined;
  return plan.lessonIds.filter((x): x is string => typeof x === 'string');
}

/** Starting an item freezes today's set (the web's startSession) so later progress doesn't reshuffle it. */
export const startSessionPatch = (session: Session): Partial<Settings> => ({ session });

/** An item of today's set was played through: tick it (the web's markDone). */
export function markDonePatch(session: Session, index: number): Partial<Settings> {
  return session.done.includes(index) ? {} : { session: { ...session, done: [...session.done, index] } };
}
