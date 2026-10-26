import { beatsPerBar } from './chart.ts';
import type { Lesson, LessonProgress, Milestone } from './lesson.ts';

// The skill map (N5): what a drummer has to master, which lessons train each skill, how far along the student is, and
// which skills are due for a refresh. The coach plans from it; Journey shows it.

export const SKILLS = [
  { id: 'time', name: 'Steady time', what: 'Counting, staying with the click, keeping time alone' },
  { id: 'hands', name: 'Hands', what: 'Even singles and doubles, both hands alike' },
  { id: 'independence', name: 'Hands and feet', what: 'Limbs doing different things at once' },
  { id: '16ths', name: '16th notes', what: '"1 e & a": busier grooves and fills' },
  { id: 'triplets', name: 'Triplets and shuffle', what: 'Three to a beat: shuffle, swing, 6/8' },
  { id: 'dynamics', name: 'Loud and soft', what: 'Accents, ghost notes, soft and loud parts' },
  { id: 'rudiments', name: 'Rudiments', what: 'Paradiddles, flams, drags, rolls' },
  { id: 'fills', name: 'Fills and solos', what: 'Fills, your own bars, landing on 1' },
  { id: 'feel', name: 'Feel', what: 'Swing, laying back, grooving at tempo' },
  { id: 'reading', name: 'Reading and ears', what: 'Reading rhythms, hearing what you play' },
  { id: 'songs', name: 'Songs', what: 'Playing whole songs with the band' },
] as const;
export type SkillId = (typeof SKILLS)[number]['id'];

/** The skills a lesson trains: from its kind and what its steps ask and play. */
export function skillsOf(l: Lesson): SkillId[] {
  const out = new Set<SkillId>();
  if (/^(count|rests|eight-in|stamina|steady)/.test(l.id) || l.steps.some(s => s.fadeClick || s.gapBars || s.countAloud)) out.add('time');
  if (/^(read-|ear-)/.test(l.id) || l.steps.some(s => s.read || s.quiz)) out.add('reading');
  if (l.kind === 'fill' || l.steps.some(s => s.freeBars?.length || s.trade)) out.add('fills');
  if (l.kind === 'song' || l.steps.some(s => s.bite)) out.add('songs');
  if (l.kind === 'rudiment') out.add('hands');
  for (const s of l.steps) {
    const c = s.chart, bpb = beatsPerBar(c), pos = (t: number) => t - Math.floor(t / bpb) * bpb;
    const on = (t: number, k: number) => Math.abs(pos(t) * k - Math.round(pos(t) * k)) < 1e-3;
    if (c.notes.some(n => n.grace || n.buzz) || /paradiddle|doubles|flam|drag|buzz/.test(l.id)) out.add('rudiments');
    if (c.notes.some(n => n.ghost || n.accent) || s.pass?.minDynamicsR !== undefined || c.dyn) out.add('dynamics');
    if (c.notes.some(n => on(n.t, 3) && !on(n.t, 2)) || c.timeSignature[1] === 8) out.add('triplets');
    if (c.notes.some(n => on(n.t, 4) && !on(n.t, 2))) out.add('16ths');
    if (c.notes.some(n => n.drum === 'kick' || n.drum === 'hhPedal') && c.notes.some(n => n.drum !== 'kick' && n.drum !== 'hhPedal')) out.add('independence');
    if (s.pass?.swingPct || s.pass?.offsetTarget || /funk-at|lay-back|swing|feel/.test(l.id)) out.add('feel');
  }
  if (!out.size) out.add('time');
  return [...out];
}

const REVIEW_DAYS = [3, 7, 14]; // a skill you've begun comes back sooner, a strong one later
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
/**
 * Per skill: lessons training it (done / all), mastery 0–1 (stars earned against 3 stars on every lesson of the
 * skill), the last day one was finished, and whether it's due for a refresh (spaced by mastery).
 */
export function skillMap(lessons: Lesson[], progress: Record<string, LessonProgress>, today: string) {
  const by = new Map<SkillId, Lesson[]>();
  for (const l of lessons) if (!l.routine) for (const s of skillsOf(l)) by.set(s, [...(by.get(s) ?? []), l]);
  return SKILLS.map(sk => {
    const ls = by.get(sk.id) ?? [], done = ls.filter(l => progress[l.id]?.completedAt);
    const mastery = ls.length ? Math.round((done.reduce((a, l) => a + (progress[l.id].stars ?? 1), 0) / (3 * ls.length)) * 100) / 100 : 0;
    const last = done.map(l => progress[l.id].completedAt!).sort().at(-1);
    const interval = REVIEW_DAYS[mastery < 0.34 ? 0 : mastery < 0.67 ? 1 : 2];
    return { ...sk, mastery, lessons: { done: done.length, all: ls.length }, last, due: !!last && days(last, today) > interval,
      reviewLesson: done.sort((a, b) => progress[a.id].completedAt!.localeCompare(progress[b.id].completedAt!))[0]?.id }; // the one played longest ago
  });
}

/** Placement (N5): one checkpoint per stage, in path order: play each until one doesn't pass, and start there. */
export const placementLadder = (lessons: Lesson[], milestones: Pick<Milestone, 'level' | 'checkpoints'>[]) =>
  milestones.flatMap(m => { const id = m.checkpoints.find(c => lessons.some(l => l.id === c)); return id ? [{ level: m.level, lessonId: id }] : []; });

/**
 * Each skill's mastery at the end of each given month (YYYY-MM): the skill map over the lessons finished by then.
 * shortcut: uses today's stars for lessons finished by then (stars aren't dated), fine for a growth line.
 */
export function skillGrowth(lessons: Lesson[], progress: Record<string, LessonProgress>, months: string[]) {
  const at = months.map(m => {
    const end = `${m}-31`, upTo = Object.fromEntries(Object.entries(progress).filter(([, p]) => p.completedAt && p.completedAt <= end));
    return skillMap(lessons, upTo, end);
  });
  return Object.fromEntries(SKILLS.map((sk, i) => [sk.id, at.map(m => m[i].mastery)])) as Record<SkillId, number[]>;
}
