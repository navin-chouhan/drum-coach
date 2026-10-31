// Flow (web src/lesson/TodayView.tsx, "More ways to play" → 🌊 Flow): the web has no Flow screen of its own; the tile
// opens the lesson player in flow mode (the groove loops, the click fades, nothing to pass) on the newest finished
// groove (the highest stage, the latest finished), else the jam lesson. Pure: /flow (FlowRoute.tsx) opens it.
import { MILESTONES } from '@drum-coach/core/content/curriculum';
import type { Lesson } from '@drum-coach/core/engine/lesson';
import { currentMilestone, visibleLessons } from '@drum-coach/core/engine/planner';
import type { Settings } from '@drum-coach/core/input/settings';

/** The lesson Flow plays and the tile's line under "Flow" (web: its title, or "play along, no score" for the jam). */
export function flowTile(lessons: Lesson[], s: Pick<Settings, 'lessons' | 'profile'>): { lessonId: string; sub: string } | null {
  const done = (id: string) => !!s.lessons[id]?.completedAt;
  const milestone = currentMilestone(MILESTONES, lessons, s.lessons, s.profile);
  const visible = visibleLessons(lessons, s.profile);
  const jam = [...visible].reverse().find(l => l.level <= (milestone?.level ?? 99) && l.steps.some(st => st.jam));
  const flow = visible.filter(l => done(l.id) && l.kind === 'groove')
    .sort((a, b) => b.level - a.level || s.lessons[b.id].completedAt!.localeCompare(s.lessons[a.id].completedAt!))[0] ?? jam;
  return flow ? { lessonId: flow.id, sub: flow !== jam ? flow.title : 'play along, no score' } : null;
}
