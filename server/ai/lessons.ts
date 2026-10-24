import { CURRICULUM, MILESTONES } from '../../src/content/curriculum.ts';
import type { AiLesson } from '../../src/coach/schemas.ts';
import type { Lesson, LessonProgress, Profile } from '../../src/engine/lesson.ts';
import { checkpointsOf, currentMilestone } from '../../src/engine/planner.ts';

// Coach-written lessons: what the coach is told, and how its answer becomes a stored lesson.
export type RecentRun = { chart: string; at: string; bpm: number; accuracy: number; summary: Record<string, unknown> };
type State = { profile: Profile; progress: Record<string, LessonProgress>; aiLessons: Lesson[]; recent: RecentRun[]; struggle?: unknown };

/** Compact model input for the current milestone; null when the path is finished. */
export function lessonInput({ profile, progress, aiLessons, recent, struggle }: State) {
  const all = [...CURRICULUM, ...aiLessons];
  const m = currentMilestone(MILESTONES, all, progress, profile);
  if (!m) return null;
  const brief = (l: Lesson) => ({ id: l.id, title: l.title, kind: l.kind });
  const steps = (l: Lesson) => l.steps.map(s => ({ title: s.title, text: s.text, activeLanes: s.activeLanes, bpm: s.bpm, notes: s.chart.notes.length > 64 ? undefined : s.chart.notes }));
  return {
    milestone: {
      level: m.level, title: m.title, canDo: m.canDo,
      checkpoints: checkpointsOf(m, all, profile).map(l => ({ ...brief(l), passed: !!progress[l.id]?.completedAt, steps: l.steps.map(s => ({ title: s.title, bpm: s.bpm })) })),
    },
    student: { goals: profile.goals.length ? profile.goals : ['not sure yet'], minutesPerDay: profile.minutesPerDay },
    progress: all.filter(l => progress[l.id]).map(l => {
      const p = progress[l.id];
      return { ...brief(l), level: l.level, byCoach: l.source === 'ai', step: p.step + 1, of: l.steps.length, bpm: p.bpm, passed: !!p.completedAt, bestBpm: p.bestBpm || undefined, stars: p.stars };
    }),
    recentRuns: recent.slice(-15),
    ...(struggle ? { struggle } : {}),
    examples: CURRICULUM.filter(l => l.level === m.level && l.kind !== 'song').slice(0, 4).map(l => ({ ...brief(l), what: l.what, how: l.how, steps: steps(l) })),
    yourEarlierLessons: aiLessons.filter(l => l.level === m.level).map(l => ({ title: l.title, passed: !!progress[l.id]?.completedAt })),
  };
}

/** Gives a coach answer its id, level and chart ids so it plugs into the path like a built-in lesson. */
export function toLesson(a: AiLesson, level: number, rand = Math.random().toString(36).slice(2, 7)): Lesson {
  const slug = a.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'lesson';
  const id = `ai-${slug}-${rand}`;
  return { ...a, id, level, source: 'ai', steps: a.steps.map((s, i) => ({ ...s, chart: { ...s.chart, id: `lesson/${id}/${i + 1}`, title: `${a.title} · ${s.title}` } })) };
}
