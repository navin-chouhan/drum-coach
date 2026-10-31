// The placement test (N5), ported from the web's PlacementView (src/ui/SkillMapView.tsx), which runs after onboarding
// for someone who has played before (TodayView: Onboarding → kit steps → placement). One short take of each stage's
// first challenge at its target tempo, from stage 1 up, until one doesn't pass; every challenge of the stages below
// counts as passed (one star) and the student starts there. Stop any time. Pure.
import { checkPass, goodMsFor, startProgress, type Lesson, type LessonProgress, type Milestone } from '@drum-coach/core/engine/lesson';
import type { RunStats } from '@drum-coach/core/engine/scoring';
import { placementLadder } from '@drum-coach/core/engine/skills';
import type { PlayOptions } from './types';

export type PlacementItem = { level: number; lessonId: string };
export const ladderOf = (lessons: Lesson[], milestones: Milestone[]): PlacementItem[] => placementLadder(lessons, milestones);

/** The take for one rung: the challenge's last step, at its target tempo, about 4 bars, with hints. */
export function placementStep(lesson: Lesson) {
  const step = lesson.steps[lesson.steps.length - 1];
  const options: PlayOptions = {
    fromBar: 1, toBar: step.chart.bars, repeats: Math.max(1, Math.ceil(4 / step.chart.bars)), speed: step.bpm.target / step.chart.bpm,
    metronome: true, subdivision: 1, countInBars: 1, wait: false, activeLanes: step.activeLanes, goodMs: goodMsFor(lesson.level), hints: true,
  };
  return { step, options };
}

/** A finished take of the rung: passed or not, and the line under it ("Rock beat: 30 of 32 notes landed, passed."). */
export function judgePlacement(stats: RunStats, lesson: Lesson): { ok: boolean; line: string } {
  const step = lesson.steps[lesson.steps.length - 1];
  const ok = checkPass(stats, step.pass, lesson.level).ok;
  return { ok, line: `${lesson.title}: ${stats.total - stats.miss} of ${stats.total} notes landed${ok ? ', passed' : ''}.` };
}

/**
 * Starting at stage `level` (Infinity: every stage passed): the progress for every challenge below it that isn't done
 * yet (done, one star, at its target tempo), and the result line. Today's set is planned again (the web's rebuildToday).
 */
export function placeAt(level: number, milestones: Milestone[], progress: Record<string, LessonProgress>, lessonById: (id: string) => Lesson | undefined, today: string) {
  const lessons = { ...progress };
  for (const m of milestones.filter(x => x.level < level)) for (const id of m.checkpoints) {
    const l = lessonById(id);
    if (l && !progress[id]?.completedAt) lessons[id] = { ...startProgress(l), step: l.steps.length - 1, completedAt: today, stars: 1, bestBpm: l.steps[l.steps.length - 1].bpm.target };
  }
  const m = milestones.find(x => x.level === level);
  return {
    patch: { lessons, session: undefined },
    result: m ? `You start at stage ${milestones.indexOf(m) + 1}: ${m.title}.` : 'You passed every stage. Impressive!',
  };
}

/** "Stage 2 of 7: one take of Rock beat at 90 BPM. Pass it and we try the next stage." */
export const rungLine = (i: number, of: number, lesson: Lesson) =>
  `Stage ${i + 1} of ${of}: one take of ${lesson.title} at ${lesson.steps[lesson.steps.length - 1].bpm.target} BPM. Pass it and we try the next stage.`;
