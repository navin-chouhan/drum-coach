// Flow (web src/lesson/TodayView.tsx, "More ways to play" → 🌊 Flow): the web has no Flow screen of its own; the tile
// opens the lesson player in flow mode (the groove loops, the click fades, nothing to pass) on the newest finished
// groove, else the jam lesson (core engine/flow.ts, shared with the web). Pure: /flow (FlowRoute.tsx) opens it.
import { MILESTONES } from '@drum-coach/core/content/curriculum';
import { flowLesson, jamLesson } from '@drum-coach/core/engine/flow';
import type { Lesson } from '@drum-coach/core/engine/lesson';
import { currentMilestone, visibleLessons } from '@drum-coach/core/engine/planner';
import type { Settings } from '@drum-coach/core/input/settings';

/** The lesson Flow plays and the tile's line under "Flow" (web: its title, or "play along, no score" for the jam). */
export function flowTile(lessons: Lesson[], s: Pick<Settings, 'lessons' | 'profile'>): { lessonId: string; sub: string } | null {
  const milestone = currentMilestone(MILESTONES, lessons, s.lessons, s.profile);
  const visible = visibleLessons(lessons, s.profile);
  const jam = jamLesson(visible, milestone?.level);
  const flow = flowLesson(visible, s.lessons, jam);
  return flow ? { lessonId: flow.id, sub: flow !== jam ? flow.title : 'play along, no score' } : null;
}
