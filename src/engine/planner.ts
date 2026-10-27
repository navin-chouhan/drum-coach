import { lighten, STRETCH_ID } from './health.ts';
import { dueReviews, isProven, type Lesson, type LessonKind, type LessonProgress, type Milestone, type Profile } from './lesson.ts';

export type SessionRole = 'stretch' | 'warmup' | 'review' | 'skill' | 'groove' | 'record'; // record: one take to beat your best; stretch: the daily routine (N10)
export type SessionItem = { role: SessionRole; lessonId: string; minutes: number };

const SKILL: LessonKind[] = ['exercise', 'rudiment'];
type Progress = Record<string, LessonProgress>;
const done = (p: Progress, id: string) => !!p[id]?.completedAt;

/** Tagged lessons show only for matching goals; no goals ("not sure yet") shows everything. */
export const visibleLessons = (lessons: Lesson[], profile: Profile) =>
  lessons.filter(l => !l.routine && (!l.tags || !profile.goals.length || l.tags.some(t => profile.goals.includes(t))));

/** Checkpoints of a milestone that this student has to pass (others are hidden by their goals). On a stage with style
 * tracks (N6), "not sure yet" follows the rock / pop track instead of every style. */
export const checkpointsOf = (m: Milestone, lessons: Lesson[], profile: Profile) =>
  visibleLessons(lessons.filter(l => m.checkpoints.includes(l.id)), m.track && !profile.goals.length ? { ...profile, goals: ['rock'] } : profile);

/** The first milestone with an unpassed checkpoint; undefined when the whole path is done. */
/**
 * A rank: locked until its checkpoints pass, earned when they do (never blocks the next stage), proven when every
 * checkpoint passed again on a later day (R7). `proven` of `total` checkpoints, for "prove it on another day (1 of 2)".
 */
export function rankState(m: Milestone, lessons: Lesson[], progress: Progress, profile: Profile): { state: 'locked' | 'earned' | 'proven'; proven: number; total: number } {
  const cps = checkpointsOf(m, lessons, profile), proven = cps.filter(l => isProven(progress[l.id])).length;
  const state = !cps.length || cps.some(l => !done(progress, l.id)) ? 'locked' : proven === cps.length ? 'proven' : 'earned';
  return { state, proven, total: cps.length };
}

/** A rank up: the stage was locked before this take and isn't after it. Passing another style track's checkpoint on an
 * already earned stage isn't one (D16). */
export const rankedUp = (m: Milestone, lessons: Lesson[], before: Progress, after: Progress, profile: Profile) =>
  rankState(m, lessons, before, profile).state === 'locked' && rankState(m, lessons, after, profile).state !== 'locked';

/** Checkpoints passed but not yet proven on another day (R7), easiest stage first. */
const unproven = (milestones: Milestone[], lessons: Lesson[], progress: Progress, profile: Profile) =>
  milestones.flatMap(m => checkpointsOf(m, lessons, profile)).filter(l => done(progress, l.id) && !isProven(progress[l.id])).map(l => l.id);

export const currentMilestone = (milestones: Milestone[], lessons: Lesson[], progress: Progress, profile: Profile) =>
  milestones.find(m => checkpointsOf(m, lessons, profile).some(l => !done(progress, l.id)));

export type Pace = 'new' | 'struggling' | 'steady' | 'flying';
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * How this student is doing, from the evidence (not an assumption): the stars of their last 4+ finished lessons and
 * their last 12 takes. Flying = ★★★ lessons (2+) and takes that land (95%+) and are tight (spread ≤ 20 ms);
 * struggling = takes under 75%, hits wandering more than any checkpoint allows (spread > 40 ms), or mostly 1-star
 * lessons. `comfortableBpm`: the median tempo of their clean takes.
 */
const STRUGGLE_SPREAD_MS = 40; // the loosest checkpoint spread limit (levels 0–2)
const STRUGGLE_TAKES = 12; // takes per finished lesson above which it reads as struggling (F6)
export function studentRead(progress: Progress, runs: { accuracy: number; spread?: number; bpm: number; chartId?: string }[] = []) {
  // completedAt is a day: lessons finished on the same day as the 4th newest all count (no arbitrary pick among them)
  const finished = Object.values(progress).filter(p => p.completedAt && p.stars).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  const since = (finished[3] ?? finished.at(-1))?.completedAt ?? '';
  const stars = finished.filter(p => p.completedAt! >= since).map(p => p.stars!);
  const recent = runs.slice(-12), spreads = recent.flatMap(r => r.spread ?? []);
  const accuracy = recent.length ? Math.round(avg(recent.map(r => r.accuracy))) : undefined;
  const spread = spreads.length ? Math.round(avg(spreads)) : undefined;
  const meanStars = stars.length ? avg(stars) : undefined;
  const clean = recent.filter(r => r.accuracy >= 90).map(r => r.bpm).sort((a, b) => a - b);
  // What finished lessons cost: many takes each means it's hard even when the notes land (F6).
  const costs = Object.entries(progress).filter(([, p]) => p.completedAt).map(([id]) => runs.filter(r => r.chartId?.startsWith(`lesson/${id}/`)).length).filter(n => n > 0);
  const takesPerLesson = costs.length ? avg(costs) : undefined;
  const pace: Pace = !stars.length && recent.length < 4 ? 'new'
    : (takesPerLesson !== undefined && takesPerLesson > STRUGGLE_TAKES) || (accuracy !== undefined && accuracy < 75) || (spread !== undefined && spread > STRUGGLE_SPREAD_MS) || (meanStars !== undefined && meanStars < 1.5) ? 'struggling'
    : stars.length >= 2 && meanStars! >= 2.75 && (accuracy ?? 100) >= 95 && (spread ?? 0) <= 20 ? 'flying'
    : 'steady';
  return { pace, takesPerLesson: takesPerLesson && Math.round(takesPerLesson), recentStars: stars, accuracyPct: accuracy, spreadMs: spread, comfortableBpm: clean.length ? Math.round(clean[clean.length >> 1]) : undefined,
    lessonsDone: Object.values(progress).filter(p => p.completedAt).length };
}

/**
 * What to learn now, best first: the coach's newest-waiting lesson, then the milestone's built-in
 * lessons in path order (checkpoints included), then any other coach lessons. Never ahead of the current milestone.
 */
export function candidates(milestones: Milestone[], lessons: Lesson[], progress: Progress, profile: Profile): Lesson[] {
  const m = currentMilestone(milestones, lessons, progress, profile);
  if (!m) return [];
  const open = visibleLessons(lessons, profile).filter(l => l.level === m.level && !done(progress, l.id));
  // Flying through the stage: the checkpoints that prove it come first; the lessons in between are optional.
  if (studentRead(progress).pace === 'flying') return [...open.filter(l => m.checkpoints.includes(l.id)), ...open.filter(l => !m.checkpoints.includes(l.id))];
  const ai = open.filter(l => l.source === 'ai');
  // One coach lesson leads; the rest wait behind the built-in path so its basics (posture, counting) aren't crowded out.
  return [...ai.slice(0, 1), ...open.filter(l => l.source !== 'ai'), ...ai.slice(1)];
}

/**
 * Today's session: warm-up (a finished rudiment, rotated by day) · one due review · up to two
 * lessons for the current milestone (a skill and a groove when both exist). Under 20 minutes a day,
 * only the two lessons.
 */
/**
 * `focusIds`: this week's lessons from the coach's plan (R6). An open one at or below the current stage leads the set;
 * a finished one comes back as the review. Unknown ids and lessons ahead of the student are ignored.
 */
export function buildSession(milestones: Milestone[], lessons: Lesson[], progress: Progress, profile: Profile, today: string, focusIds: string[] = [], opts: { sore?: boolean; skillReview?: string } = {}): SessionItem[] {
  const items = buildSet(milestones, lessons, progress, profile, today, focusIds, opts.skillReview);
  // every day opens with the 2-minute stretch (N10); a sore week gets lighter days
  const stretch = lessons.some(l => l.id === STRETCH_ID) ? [{ role: 'stretch' as const, lessonId: STRETCH_ID, minutes: 2 }] : [];
  return opts.sore ? lighten([...stretch, ...items]) : [...stretch, ...items];
}
function buildSet(milestones: Milestone[], lessons: Lesson[], progress: Progress, profile: Profile, today: string, focusIds: string[], skillReview?: string): SessionItem[] {
  const short = profile.minutesPerDay < 20;
  const level = currentMilestone(milestones, lessons, progress, profile)?.level ?? Infinity;
  const focus = focusIds.map(id => visibleLessons(lessons, profile).find(l => l.id === id)).filter(l => l !== undefined && l.level <= level) as Lesson[];
  const lead = focus.find(l => !done(progress, l.id));
  // after the whole path: the coach's open challenge lessons are the learning (candidates has no stage left)
  const c = (level === Infinity ? visibleLessons(lessons, profile).filter(l => l.source === 'ai' && !done(progress, l.id)) : candidates(milestones, lessons, progress, profile)).filter(l => l !== lead);
  // the stage song's bites lead the groove slot while the song isn't learned (R8)
  const skill = lead ?? c.find(l => SKILL.includes(l.kind)), groove = c.find(l => l.id.startsWith('bite-')) ?? c.find(l => !SKILL.includes(l.kind) && l !== skill);
  const learning = [skill, groove].filter(l => l !== undefined);
  if (learning.length < 2) learning.push(...c.filter(l => !learning.includes(l)).slice(0, 2 - learning.length));
  const taken = new Set(learning.map(l => l.id));

  const rudiments = visibleLessons(lessons, profile).filter(l => l.kind === 'rudiment' && done(progress, l.id));
  const day = Number(today.replaceAll('-', ''));
  const warmup = short || !rudiments.length ? undefined : rudiments[day % rudiments.length];
  if (warmup) taken.add(warmup.id);
  const review = short ? undefined : focus.find(l => done(progress, l.id) && !taken.has(l.id))?.id ?? dueReviews(progress, today).find(id => !taken.has(id) && lessons.some(l => l.id === id))
    ?? (skillReview && !taken.has(skillReview) && lessons.some(l => l.id === skillReview) ? skillReview : undefined) // N5: a skill due for a refresh
    ?? (level === Infinity ? unproven(milestones, lessons, progress, profile).find(id => !taken.has(id)) : undefined); // after the path: prove a rank

  // After the whole path the set never goes empty: one take of a show-off song (the newest stage's song you finished).
  const showoff = level === Infinity ? visibleLessons(lessons, profile).filter(l => l.kind === 'song' && done(progress, l.id) && !l.id.startsWith('bite-') && l.id !== review).sort((a, b) => b.level - a.level)[0] : undefined;
  if (showoff) taken.add(showoff.id);
  const fixed = (warmup ? 3 : 0) + (review ? 4 : 0) + (showoff ? 5 : 0);
  const each = Math.max(5, Math.floor((profile.minutesPerDay - fixed) / Math.max(1, learning.length)));
  return [
    ...(warmup ? [{ role: 'warmup' as const, lessonId: warmup.id, minutes: 3 }] : []),
    ...(review ? [{ role: 'review' as const, lessonId: review, minutes: 4 }] : []),
    ...learning.map(l => ({ role: SKILL.includes(l.kind) || l === lead ? 'skill' as const : 'groove' as const, lessonId: l.id, minutes: each })),
    ...(showoff ? [{ role: 'review' as const, lessonId: showoff.id, minutes: 5 }] : []),
  ];
}
