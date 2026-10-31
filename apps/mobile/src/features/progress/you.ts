// You (D10 reorganisation, docs/mobile/reorg/you-after.png): Progress plus the coach's week plan. Two cards (Getting
// better, This week) and six doors to the detail views. The doors' words, from the Progress model and the saved plan.
// Pure. "Your time" (the 14-day minutes chart) is cut: This week shows the same minutes (owner-approved, D10).
import type { Plan } from '@drum-coach/core/coach/schemas';
import type { ProgressModel } from './progress';
import type { ProgressViewId } from './path';

export type Door = { id: string; emoji: string; title: string; sub: string; view: ProgressViewId };

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** "Mon–Sun · 6 lessons" from the coach's plan, or what to do when there's none. */
export function planLine(plan: Partial<Pick<Plan, 'days' | 'lessonIds' | 'focus'>> | undefined): string {
  if (!plan) return 'not written yet';
  const days = plan.days ?? [];
  const span = days.length ? (days.length > 1 ? `${days[0].day.slice(0, 3)}–${days[days.length - 1].day.slice(0, 3)}` : days[0].day.slice(0, 3)) : '';
  const lessons = plan.lessonIds?.length ? plural(plan.lessonIds.length, 'lesson') : plan.focus ? `focus: ${plan.focus}` : '';
  return [span, lessons].filter(Boolean).join(' · ') || 'this week';
}

export function youDoors(m: ProgressModel, plan: Partial<Pick<Plan, 'days' | 'lessonIds' | 'focus'>> | undefined): Door[] {
  const t = m.trophies, next = t.closest[0];
  const lessons = m.lessons.length + m.exercises.length;
  return [
    { id: 'path', emoji: '🗺️', title: 'Path & skills', sub: `Stage ${m.week.stage.n} of ${m.week.stage.of} · skill map`, view: 'path' },
    { id: 'trophies', emoji: '🏆', title: 'Trophies', sub: `${t.earned} earned${next ? ` · next: ${next.name}` : ''}`, view: 'trophies' },
    { id: 'lessons', emoji: '📚', title: 'Your lessons', sub: `${lessons} · ★ ${m.better.stars}`, view: 'lessons' },
    { id: 'plan', emoji: '🗓️', title: 'Coach’s week plan', sub: planLine(plan), view: 'plan' },
    { id: 'showoff', emoji: '🎤', title: 'Show-off & fills', sub: `${plural(m.showoff.songs.length, 'song')} · ${plural(m.fills.rows.length, 'fill')}`, view: 'coming' },
    { id: 'reports', emoji: '📝', title: 'Reports', sub: 'month · for your teacher', view: 'reports' },
  ];
}
