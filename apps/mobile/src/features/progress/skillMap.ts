// The skill map page (N5): how far along each skill is (stars earned against three on every lesson of the skill), its
// last 6 months, and which are due for a refresh. Ported from the web's src/ui/SkillMapView.tsx.
import type { Lesson, LessonProgress } from '@drum-coach/core/engine/lesson';
import { monthly } from '@drum-coach/core/engine/history';
import { skillGrowth, skillMap } from '@drum-coach/core/engine/skills';

export function skillMapModel(lessons: Lesson[], progress: Record<string, LessonProgress>, today: string, now: number) {
  const map = skillMap(lessons, progress, today);
  const growth = skillGrowth(lessons, progress, monthly([], now).map(m => m.month));
  return map.map(k => ({
    id: k.id, name: k.name, what: k.what,
    pct: Math.round(k.mastery * 100),
    /** The bar's width, never quite empty (2%). */
    fill: Math.max(0.02, k.mastery),
    count: `${k.lessons.done} of ${k.lessons.all} lessons`,
    growth: growth[k.id].map(v => Math.round(v * 100)),
    refresh: k.due && k.reviewLesson ? k.reviewLesson : undefined,
  }));
}

export const SKILL_MAP_INTRO = 'Every lesson trains one or more of these. The bar fills with the stars you earn; a skill you haven\'t touched for a while asks for a refresh, and your coach plans your weeks from this map.';
