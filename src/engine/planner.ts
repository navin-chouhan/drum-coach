import { dueReviews, type Lesson, type LessonKind, type LessonProgress, type Milestone, type Profile } from './lesson.ts';

export type SessionRole = 'warmup' | 'review' | 'skill' | 'groove' | 'record'; // record: one take to beat your best
export type SessionItem = { role: SessionRole; lessonId: string; minutes: number };

const SKILL: LessonKind[] = ['exercise', 'rudiment'];
type Progress = Record<string, LessonProgress>;
const done = (p: Progress, id: string) => !!p[id]?.completedAt;

/** Tagged lessons show only for matching goals; no goals ("not sure yet") shows everything. */
export const visibleLessons = (lessons: Lesson[], profile: Profile) =>
  lessons.filter(l => !l.tags || !profile.goals.length || l.tags.some(t => profile.goals.includes(t)));

/** Checkpoints of a milestone that this student has to pass (others are hidden by their goals). */
export const checkpointsOf = (m: Milestone, lessons: Lesson[], profile: Profile) =>
  visibleLessons(lessons.filter(l => m.checkpoints.includes(l.id)), profile);

/** The first milestone with an unpassed checkpoint; undefined when the whole path is done. */
export const currentMilestone = (milestones: Milestone[], lessons: Lesson[], progress: Progress, profile: Profile) =>
  milestones.find(m => checkpointsOf(m, lessons, profile).some(l => !done(progress, l.id)));

/**
 * What to learn now, best first: the coach's newest-waiting lesson, then the milestone's built-in
 * lessons in path order (checkpoints included), then any other coach lessons. Never ahead of the current milestone.
 */
export function candidates(milestones: Milestone[], lessons: Lesson[], progress: Progress, profile: Profile): Lesson[] {
  const m = currentMilestone(milestones, lessons, progress, profile);
  if (!m) return [];
  const open = visibleLessons(lessons, profile).filter(l => l.level === m.level && !done(progress, l.id));
  const ai = open.filter(l => l.source === 'ai');
  // One coach lesson leads; the rest wait behind the built-in path so its basics (posture, counting) aren't crowded out.
  return [...ai.slice(0, 1), ...open.filter(l => l.source !== 'ai'), ...ai.slice(1)];
}

/**
 * Today's session: warm-up (a finished rudiment, rotated by day) · one due review · up to two
 * lessons for the current milestone (a skill and a groove when both exist). Under 20 minutes a day,
 * only the two lessons.
 */
export function buildSession(milestones: Milestone[], lessons: Lesson[], progress: Progress, profile: Profile, today: string): SessionItem[] {
  const short = profile.minutesPerDay < 20;
  const c = candidates(milestones, lessons, progress, profile);
  const skill = c.find(l => SKILL.includes(l.kind)), groove = c.find(l => !SKILL.includes(l.kind));
  const learning = [skill, groove].filter(l => l !== undefined);
  if (learning.length < 2) learning.push(...c.filter(l => !learning.includes(l)).slice(0, 2 - learning.length));
  const taken = new Set(learning.map(l => l.id));

  const rudiments = visibleLessons(lessons, profile).filter(l => l.kind === 'rudiment' && done(progress, l.id));
  const day = Number(today.replaceAll('-', ''));
  const warmup = short || !rudiments.length ? undefined : rudiments[day % rudiments.length];
  if (warmup) taken.add(warmup.id);
  const review = short ? undefined : dueReviews(progress, today).find(id => !taken.has(id) && lessons.some(l => l.id === id));

  const fixed = (warmup ? 3 : 0) + (review ? 4 : 0);
  const each = Math.max(5, Math.floor((profile.minutesPerDay - fixed) / Math.max(1, learning.length)));
  return [
    ...(warmup ? [{ role: 'warmup' as const, lessonId: warmup.id, minutes: 3 }] : []),
    ...(review ? [{ role: 'review' as const, lessonId: review, minutes: 4 }] : []),
    ...learning.map(l => ({ role: SKILL.includes(l.kind) ? 'skill' as const : 'groove' as const, lessonId: l.id, minutes: each })),
  ];
}
