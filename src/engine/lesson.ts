import type { Chart, ChartDrum } from './chart.ts';
import type { RunStats } from './scoring.ts';

// Lessons, pass criteria, the tempo ladder and spaced review. See docs/LEARNING.md.

export type Genre = 'rock' | 'funk' | 'jazz';
export type Pass = {
  accuracy: number;           // % of notes within the Good window
  maxExtraPct: number;        // extra hits as % of notes
  maxAbsOffsetMs?: number;    // rushing/dragging limit
  maxVelocityCv?: number;     // evenness: velocity variation % of normal notes
  maxGhostToAccent?: number;  // dynamics: ghost (or unaccented) volume / accent volume
};
export const DEFAULT_PASS: Pass = { accuracy: 90, maxExtraPct: 15 };

export type Step = {
  title: string; text: string; chart: Chart;
  activeLanes?: ChartDrum[];  // lanes the student plays; omitted = all
  bpm: { start: number; target: number };
  pass?: Partial<Pass>;
  gapBars?: number;
};
export type LessonKind = NonNullable<Chart['kind']>;
export type Lesson = {
  id: string; level: number; kind: LessonKind; title: string;
  what: string; why: string; how: string;
  steps: Step[]; tags?: Genre[];
  source?: 'ai'; focus?: string; // AI-curated for this student; `focus` says why
};
/** A fixed point on the path: what you can do, proven by passing its checkpoint lessons. */
export type Milestone = { level: number; title: string; rank: string; canDo: string[]; checkpoints: string[] }; // rank: your title once it's passed
export type Profile = { goals: Genre[]; minutesPerDay: number; onboarded: boolean };
export type LessonProgress = {
  step: number; bpm: number; clean: number; fails: number; bestBpm: number;
  completedAt?: string; reviewStage: number; reviewDue?: string; // dates are local YYYY-MM-DD
  stars?: number; // best 1–3 earned when the lesson completes (older saves: none)
};

export const CLEAN_TAKES = 2, FAILS_BEFORE_SLOWDOWN = 3, BPM_STEP = 5;
export const REVIEW_DAYS = [2, 5, 12, 30];

export const startProgress = (l: Lesson): LessonProgress =>
  ({ step: 0, bpm: l.steps[0].bpm.start, clean: 0, fails: 0, bestBpm: 0, reviewStage: 0 });

/** Did this take pass? `reason` is the one thing to fix, in plain words. */
export function checkPass(s: RunStats, p?: Partial<Pass>): { ok: boolean; reason?: string } {
  const c = { ...DEFAULT_PASS, ...p };
  if (s.accuracy < c.accuracy) return { ok: false, reason: `${s.accuracy}% of notes on time, ${c.accuracy}% needed. ${worstDrum(s)}` };
  if (s.total && (s.extra / s.total) * 100 > c.maxExtraPct) return { ok: false, reason: `${s.extra} extra hits. Play only the notes shown.` };
  if (c.maxAbsOffsetMs !== undefined && Math.abs(s.meanOffset) > c.maxAbsOffsetMs)
    return { ok: false, reason: `${s.meanOffset < 0 ? 'Rushing' : 'Dragging'} by ${Math.abs(s.meanOffset)} ms. Lock onto the click.` };
  if (c.maxVelocityCv !== undefined && s.velocity.normalCv > c.maxVelocityCv)
    return { ok: false, reason: `Volume varies by ${s.velocity.normalCv}%. Aim for every stroke the same height.` };
  if (c.maxGhostToAccent !== undefined) {
    const soft = s.velocity.ghostMean ?? s.velocity.normalMean, loud = s.velocity.accentMean;
    if (loud && soft / loud > c.maxGhostToAccent) return { ok: false, reason: 'Make the accents louder and the other notes softer.' };
  }
  return { ok: true };
}

function worstDrum(s: RunStats) {
  const worst = Object.entries(s.perDrum).sort((a, b) => a[1].accuracy - b[1].accuracy)[0];
  if (!worst || worst[1].accuracy >= 90) return '';
  const name = worst[0] === 'hhOpen' ? 'open hi-hat' : worst[0] === 'hhPedal' ? 'hi-hat foot' : worst[0] === 'hihat' ? 'hi-hat' : worst[0];
  const t = worst[1].meanOffset;
  return `The ${name} was weakest${Math.abs(t) >= 15 ? ` (${t < 0 ? 'early' : 'late'} by ${Math.abs(t)} ms)` : ''}.`;
}

/**
 * Stars for the take that completed a lesson (always at the target tempo):
 * ★ passed · ★★ ≥95% on time and ≤5% extra hits · ★★★ ≥98%, ≤2% extra and ≥70% of notes perfect.
 */
export function starsFor(s: RunStats): 1 | 2 | 3 {
  const extraPct = s.total ? (s.extra / s.total) * 100 : 0, perfectPct = s.total ? (s.perfect / s.total) * 100 : 0;
  if (s.accuracy >= 98 && extraPct <= 2 && perfectPct >= 70) return 3;
  if (s.accuracy >= 95 && extraPct <= 5) return 2;
  return 1;
}

export type LadderEvent = 'up' | 'hold' | 'slowDown' | 'stepDone' | 'lessonDone';

/** Tempo ladder: CLEAN_TAKES passes → +5 BPM up to the target, then the next step; repeated fails → −5 BPM. */
export function ladderStep(p: LessonProgress, lesson: Lesson, passed: boolean, today: string): { next: LessonProgress; event: LadderEvent } {
  const step = lesson.steps[Math.min(p.step, lesson.steps.length - 1)];
  const last = p.step >= lesson.steps.length - 1;
  if (!passed) {
    const fails = p.fails + 1;
    if (fails < FAILS_BEFORE_SLOWDOWN || p.bpm <= step.bpm.start) return { next: { ...p, clean: 0, fails: fails >= FAILS_BEFORE_SLOWDOWN ? 0 : fails }, event: 'hold' };
    return { next: { ...p, clean: 0, fails: 0, bpm: Math.max(step.bpm.start, p.bpm - BPM_STEP) }, event: 'slowDown' };
  }
  const clean = p.clean + 1;
  const bestBpm = last ? Math.max(p.bestBpm, p.bpm) : p.bestBpm;
  if (clean < CLEAN_TAKES) return { next: { ...p, clean, fails: 0, bestBpm }, event: 'hold' };
  if (p.bpm < step.bpm.target) return { next: { ...p, clean: 0, fails: 0, bestBpm, bpm: Math.min(step.bpm.target, p.bpm + BPM_STEP) }, event: 'up' };
  if (!last) return { next: { ...p, step: p.step + 1, bpm: lesson.steps[p.step + 1].bpm.start, clean: 0, fails: 0, bestBpm }, event: 'stepDone' };
  const done = p.completedAt ? {} : { completedAt: today, reviewStage: 0, reviewDue: addDays(today, REVIEW_DAYS[0]) };
  return { next: { ...p, clean: 0, fails: 0, bestBpm, ...done }, event: 'lessonDone' };
}

/** Spaced review: a pass pushes the next review further out (2, 5, 12, 30 days); a fail brings it back tomorrow. */
export function afterReview(p: LessonProgress, passed: boolean, today: string): LessonProgress {
  const reviewStage = passed ? Math.min(p.reviewStage + 1, REVIEW_DAYS.length - 1) : 0;
  return { ...p, reviewStage, reviewDue: addDays(today, passed ? REVIEW_DAYS[reviewStage] : 1) };
}

export const dueReviews = (progress: Record<string, LessonProgress>, today: string) =>
  Object.entries(progress).filter(([, p]) => p.completedAt && p.reviewDue && p.reviewDue <= today)
    .sort((a, b) => a[1].reviewDue!.localeCompare(b[1].reviewDue!)).map(([id]) => id);

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}
