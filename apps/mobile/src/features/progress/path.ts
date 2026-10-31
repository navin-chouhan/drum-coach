// Your path (the web's "Full path" in src/lesson/TodayView.tsx): every stage with its challenges (checkpoints) and its
// other lessons, each marked done / started / not started, the current stage's "can do" list and style track.
import { MILESTONES } from '@drum-coach/core/content/curriculum';
import type { Genre, Lesson, LessonProgress, Profile } from '@drum-coach/core/engine/lesson';
import { checkpointsOf, currentMilestone, visibleLessons } from '@drum-coach/core/engine/planner';
import type { Settings } from '@drum-coach/core/input/settings';

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

// The actions under the web's Full path (TodayView): rebuild today's mix, find my level, goals (change), reset.
export const REBUILD_LABEL = "Rebuild today's mix";
export const REBUILD_CONFIRM = 'Plan today again from your current progress?';
export const FIND_LEVEL_LABEL = 'Find my level (a short placement test)';
export const RESET_LABEL = 'Reset all lesson progress';
export const RESET_CONFIRM = 'Reset all lesson progress and redo the setup questions? Your run history in Progress is kept.';
/** "Goals: rock, funk · 25 min/day (change)". */
export const goalsLabel = (p: Profile) => `Goals: ${p.goals.length ? p.goals.join(', ') : 'not sure yet'} · ${p.minutesPerDay} min/day (change)`;
/** The web asks before rebuilding only when something of today's set is already done. */
export const rebuildNeedsConfirm = (s: Pick<Settings, 'session'>) => !!s.session?.done.length;
/** state.ts rebuildToday: today's set is planned again on the next Journey visit. */
export const rebuildTodayPatch = (): Partial<Settings> => ({ session: undefined });
/** state.ts resetAllLessons: lesson progress and today's set go, the setup questions come back; runs stay. */
export const resetAllLessonsPatch = (profile: Profile): Partial<Settings> => ({ lessons: {}, session: undefined, profile: { ...profile, onboarded: false } });

/** Progress's views, as `/progress?view=…` (Journey's Skill map and Full path buttons land on them). */
export type ProgressViewId = 'main' | 'skills' | 'path' | 'month';
export const progressViewOf = (v: unknown): ProgressViewId => (v === 'skills' || v === 'path' || v === 'month' ? v : 'main');
