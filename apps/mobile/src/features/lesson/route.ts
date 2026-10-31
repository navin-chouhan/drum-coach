// The lesson route's params (/lesson/<id>?item=N&mode=play|hear|jam, as Journey opens it) and today's set around the
// item: its role and minutes, whether there's a next item, ticking it done. Pure, tested. Ported from
// src/lesson/TodayView.tsx (how it opens LessonPlayer) and src/lesson/state.ts (markDone).
import type { SessionRole } from '@drum-coach/core/engine/planner';
import type { Lesson } from '@drum-coach/core/engine/lesson';
import type { Session, Settings } from '@drum-coach/core/input/settings';
import { markDonePatch } from '../journey/source';

/** play: open the lesson; hear: open it and play the demo; jam: the jam lesson (played as a lesson, as on the web);
 * flow / arcade: the web's Flow and 2-minute challenge tiles. */
export type LessonMode = 'play' | 'hear' | 'jam' | 'flow' | 'arcade';

/** `role=record`: Journey's "Beat your best" (the web opens LessonPlayer with role 'record' outside today's set). */
export type LessonParams = { id: string; item: number; mode: LessonMode; role?: 'record' };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseLessonParams(p: { id?: string | string[]; item?: string | string[]; mode?: string | string[]; role?: string | string[] }): LessonParams {
  const id = one(p.id) ?? '';
  const n = Number(one(p.item));
  const m = one(p.mode);
  return { id, item: Number.isInteger(n) && n >= 0 ? n : -1, mode: m === 'hear' || m === 'jam' || m === 'flow' || m === 'arcade' ? m : 'play', ...(one(p.role) === 'record' && { role: 'record' as const }) };
}

/** Today's set item the lesson was opened for (only when it's today's stored set and the item is this lesson). */
export function setItemOf(s: Settings, item: number, lessonId: string, today: string): { role: SessionRole; minutes: number } | undefined {
  const it = item >= 0 && s.session?.date === today ? s.session.items[item] : undefined;
  return it && it.lessonId === lessonId ? { role: it.role, minutes: it.minutes } : undefined;
}

/** The next item of today's set that isn't done (and still exists), after `item`, else before it. */
export function nextItem(session: Session | undefined, item: number, today: string, exists: (id: string) => boolean): { index: number; lessonId: string } | undefined {
  if (!session || session.date !== today || item < 0) return undefined;
  const open = session.items.map((it, i) => ({ i, it })).filter(({ i, it }) => i !== item && !session.done.includes(i) && exists(it.lessonId));
  const pick = open.find(x => x.i > item) ?? open[0];
  return pick && { index: pick.i, lessonId: pick.it.lessonId };
}

/** Tick the item done (Journey's markDonePatch), or nothing when it isn't today's set. */
export function itemDonePatch(s: Settings, item: number, today: string): Partial<Settings> {
  return item >= 0 && s.session?.date === today ? markDonePatch(s.session, item) : {};
}

export const lessonHref = (lessonId: string, item = -1, mode: LessonMode = 'play', role?: 'record') => {
  const q = [item >= 0 ? `item=${item}` : '', mode !== 'play' ? `mode=${mode}` : '', role ? `role=${role}` : ''].filter(Boolean).join('&');
  return `/lesson/${encodeURIComponent(lessonId)}${q ? `?${q}` : ''}`;
};

/** The lessons the route can open: built-in plus the coach's (Journey's allLessons). */
export const findLesson = (lessons: Lesson[], id: string) => lessons.find(l => l.id === id);
