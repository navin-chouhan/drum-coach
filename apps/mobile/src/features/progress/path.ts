// Your path (the web's "Full path" in src/lesson/TodayView.tsx): every stage with its challenges (checkpoints) and its
// other lessons, each marked done / started / not started, the current stage's "can do" list and style track.
import { MILESTONES } from '@drum-coach/core/content/curriculum';
import type { Genre, Lesson, LessonProgress, Profile } from '@drum-coach/core/engine/lesson';
import { checkpointsOf, currentMilestone, visibleLessons } from '@drum-coach/core/engine/planner';

export type PathChip = { id: string; title: string; state: 'done' | 'started' | 'todo'; stars?: number; checkpoint: boolean; ai: boolean; detail: string };
export type PathStage = { level: number; n: number; title: string; state: 'passed' | 'current' | 'later'; canDo: string[]; track?: string; chips: PathChip[] };

export function pathModel(lessons: Lesson[], progress: Record<string, LessonProgress>, profile: Profile): PathStage[] {
  const milestone = currentMilestone(MILESTONES, lessons, progress, profile);
  const visible = visibleLessons(lessons, profile);
  const chip = (l: Lesson, checkpoint: boolean): PathChip => {
    const p = progress[l.id];
    return {
      id: l.id, title: l.title, checkpoint, ai: l.source === 'ai',
      state: p?.completedAt ? 'done' : p ? 'started' : 'todo', stars: p?.completedAt ? p.stars ?? 1 : undefined,
      detail: p?.completedAt ? `Done · ${p.stars ?? 1} of 3 stars · best ${p.bestBpm} BPM` : p ? `Step ${p.step + 1} · ${p.bpm} BPM` : 'Not started',
    };
  };
  return MILESTONES.flatMap(m => {
    const checks = checkpointsOf(m, lessons, profile);
    if (!checks.length) return [];
    const passed = checks.every(l => progress[l.id]?.completedAt);
    const current = m === milestone;
    const extra = visible.filter(l => l.level === m.level && !m.checkpoints.includes(l.id));
    const track = current && m.track ? Object.entries(m.track).filter(([g]) => !profile.goals.length || profile.goals.includes(g as Genre)).map(([, t]) => t).join(' · ') : undefined;
    return [{
      level: m.level, n: m.level + 1, title: m.title, state: passed ? 'passed' as const : current ? 'current' as const : 'later' as const,
      canDo: current ? m.canDo : [], ...(track && { track }),
      chips: [...checks.map(l => chip(l, true)), ...extra.map(l => chip(l, false))],
    }];
  });
}

export const PATH_NOTE = "Pass a stage's challenges to move on. You can open any lesson; today's mix sticks to your current stage.";

/** Progress's views, as `/progress?view=…` (Journey's Skill map and Full path buttons land on them). */
export type ProgressViewId = 'main' | 'skills' | 'path' | 'month';
export const progressViewOf = (v: unknown): ProgressViewId => (v === 'skills' || v === 'path' || v === 'month' ? v : 'main');
