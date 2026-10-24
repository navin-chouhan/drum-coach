import { dueReviews, type Lesson, type LessonKind, type LessonProgress, type Profile } from './lesson.ts';

export type SessionRole = 'warmup' | 'review' | 'skill' | 'groove';
export type SessionItem = { role: SessionRole; lessonId: string; minutes: number };

const SKILL: LessonKind[] = ['exercise', 'rudiment'];
const GROOVE: LessonKind[] = ['groove', 'fill', 'song'];

/** Tagged lessons show only for matching goals; no goals ("not sure yet") shows everything. */
export const visibleLessons = (lessons: Lesson[], profile: Profile) =>
  lessons.filter(l => !l.tags || !profile.goals.length || l.tags.some(t => profile.goals.includes(t)));

/** The next lesson on the path: the first unfinished visible one (curriculum order is the path). */
export const nextLesson = (lessons: Lesson[], progress: Record<string, LessonProgress>, profile: Profile, kinds?: LessonKind[]) =>
  visibleLessons(lessons, profile).find(l => !progress[l.id]?.completedAt && (!kinds || kinds.includes(l.kind)));

/**
 * Today's session: warm-up (a finished rudiment, rotated by day) · one due review · one new skill ·
 * one groove/fill/song. Under 20 minutes a day, only the skill and the groove.
 */
export function buildSession(lessons: Lesson[], progress: Record<string, LessonProgress>, profile: Profile, today: string): SessionItem[] {
  const short = profile.minutesPerDay < 20;
  const skill = nextLesson(lessons, progress, profile, SKILL);
  const groove = nextLesson(lessons, progress, profile, GROOVE);
  const learning = [skill, groove].filter(l => l !== undefined);
  const taken = new Set(learning.map(l => l.id));

  const rudiments = visibleLessons(lessons, profile).filter(l => l.kind === 'rudiment' && progress[l.id]?.completedAt);
  const day = Number(today.replaceAll('-', ''));
  const warmup = short || !rudiments.length ? undefined : rudiments[day % rudiments.length];
  if (warmup) taken.add(warmup.id);
  const review = short ? undefined : dueReviews(progress, today).find(id => !taken.has(id) && lessons.some(l => l.id === id));

  const fixed = (warmup ? 3 : 0) + (review ? 4 : 0);
  const each = Math.max(5, Math.round((profile.minutesPerDay - fixed) / Math.max(1, learning.length)));
  return [
    ...(warmup ? [{ role: 'warmup' as const, lessonId: warmup.id, minutes: 3 }] : []),
    ...(review ? [{ role: 'review' as const, lessonId: review, minutes: 4 }] : []),
    ...(skill ? [{ role: 'skill' as const, lessonId: skill.id, minutes: each }] : []),
    ...(groove ? [{ role: 'groove' as const, lessonId: groove.id, minutes: each }] : []),
  ];
}
