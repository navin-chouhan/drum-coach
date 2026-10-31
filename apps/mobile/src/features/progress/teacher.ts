// "For your teacher" (N2, the web's src/ui/TeacherView.tsx): a one-page summary to show a drum teacher, and the
// teacher's notes typed back in, which the coach reads (the `teacherNotes` setting, in every coach context). On the
// iPad the page is shared as text through the share sheet instead of printed. Pure.
import { LESSON_BY_ID, MILESTONES } from '@drum-coach/core/content/curriculum';
import type { Lesson, LessonProgress, Profile } from '@drum-coach/core/engine/lesson';
import { rankState } from '@drum-coach/core/engine/planner';
import { studentProfile } from '@drum-coach/core/engine/profile';
import type { RunRow } from '@drum-coach/core/engine/progress';
import { z } from 'zod';
import { dayKey } from './dates';

export type TeacherNote = { date: string; text: string };
export const TEACHER_NOTES_KEY = 'teacherNotes';
const NoteSchema = z.object({ date: z.string().max(30), text: z.string().max(4000) });

export const TEACHER_INTRO = 'A one-page summary to share with a drum teacher, now and then (monthly is great). With it, bring a take\'s MIDI file '
  + '(Share take, under a lesson\'s result). Type what the teacher says below: your coach reads it.';
export const TEACHER_QUESTIONS = 'Questions for the teacher: is my grip and stroke relaxed? Anything in my posture or feet? What should I practise next?';
export const NOTE_PLACEHOLDER = 'e.g. Left wrist is stiff: practise slow singles with the left hand only. Heel too high on the kick.';

/** The saved notes, oldest first; anything malformed is dropped. */
export function readTeacherNotes(raw: unknown): TeacherNote[] {
  return Array.isArray(raw) ? raw.flatMap(n => { const p = NoteSchema.safeParse(n); return p.success ? [p.data] : []; }) : [];
}

/** Adds a note (trimmed, up to 1000 characters) and keeps the last 20, as the web saves them; empty adds nothing. */
export function addTeacherNote(notes: TeacherNote[], text: string, now = new Date()): TeacherNote[] {
  const t = text.trim();
  return t ? [...notes, { date: dayKey(now), text: t.slice(0, 1000) }].slice(-20) : notes;
}

export type TeacherInput = { runs: RunRow[]; progress: Record<string, LessonProgress>; profile: Profile; leftHanded?: boolean; lessons: Lesson[]; now?: Date };

/** The sheet's lines, in the web's words; `text` is the same page as plain text for the share sheet. */
export function teacherSheet(i: TeacherInput) {
  const now = i.now ?? new Date();
  const ranks = MILESTONES.map(m => ({ m, r: rankState(m, i.lessons, i.progress, i.profile) })).filter(x => x.r.total);
  const next = ranks.find(x => x.r.state === 'locked');
  const done = Object.entries(i.progress).filter(([, p]) => p.completedAt)
    .map(([id, p]) => ({ title: LESSON_BY_ID[id]?.title ?? i.lessons.find(l => l.id === id)?.title ?? id, stars: p.stars ?? 1, bpm: p.bestBpm, at: p.completedAt! }))
    .sort((a, b) => b.at.localeCompare(a.at));
  const sp = i.runs.length ? studentProfile(i.runs, now) : undefined;
  const title = `Drum Coach progress · ${dayKey(now)}`;
  const goals = `${i.profile.goals.length ? i.profile.goals.join(', ') : 'not sure yet'} · ${i.profile.minutesPerDay} min a day${i.leftHanded ? ' · left-handed' : ''}`;
  const rankLine = `${ranks.filter(x => x.r.state !== 'locked').map(({ m, r }) => `${m.rank}${r.state === 'proven' ? ' (proven)' : ''}`).join(', ') || 'none yet'}`
    + (next ? ` · working on: stage ${next.m.level + 1}, ${next.m.title}` : '');
  const last28 = sp && `${sp.days} days, ${sp.minutes} minutes${sp.timing ? `, on average ${Math.abs(Math.round(sp.timing.offset))} ms ${sp.timing.offset >= 0 ? 'late' : 'early'}${sp.timing.trend ? ` (${sp.timing.trend})` : ''}` : ''}.`;
  const perDrum = sp ? Object.entries(sp.perDrum).map(([d, v]) => ({ drum: d, landed: `${v.accuracy}% landed`, offset: `${v.offset >= 0 ? '+' : ''}${v.offset} ms`, trend: v.trend ?? '' })) : [];
  const tips = sp?.topTips.length ? sp.topTips.map(t => `${t.words} (${t.count}×)`).join(', ') : undefined;
  const lessonsLine = done.slice(0, 20).map(l => `${l.title} ${'★'.repeat(l.stars)}${l.bpm ? ` ${l.bpm} BPM` : ''}`).join(' · ') || 'none yet';
  const rows: [string, string][] = [
    ['Goals', goals], ['Ranks', rankLine],
    ...(last28 ? [['Last 28 days', last28] as [string, string]] : []),
    ...(tips ? [['What the app keeps saying', tips] as [string, string]] : []),
    [`Lessons finished (${done.length})`, lessonsLine],
  ];
  return { title, rows, perDrum, questions: TEACHER_QUESTIONS };
}

/** The page as plain text (the share sheet's message), with the teacher's notes at the end. */
export function teacherText(sheet: ReturnType<typeof teacherSheet>, notes: TeacherNote[]): string {
  return [
    sheet.title, '',
    ...sheet.rows.map(([k, v]) => `${k}: ${v}`),
    ...(sheet.perDrum.length ? ['', ...sheet.perDrum.map(d => `${d.drum}: ${d.landed}, ${d.offset}${d.trend ? `, ${d.trend}` : ''}`)] : []),
    '', sheet.questions,
    ...(notes.length ? ['', "The teacher's notes:", ...notes.map(n => `${n.date}: ${n.text}`)] : []),
  ].join('\n');
}
