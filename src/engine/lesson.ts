import { beatsPerBar, type Chart, type ChartDrum } from './chart.ts';
import type { RunStats } from './scoring.ts';

// Lessons, pass criteria, the tempo ladder and spaced review. See docs/LEARNING.md.

export type Genre = 'rock' | 'funk' | 'jazz';
export type Pass = {
  accuracy: number;           // % of notes within the Good window
  maxExtraPct: number;        // extra hits as % of notes
  maxAbsOffsetMs?: number;    // rushing/dragging limit
  maxVelocityCv?: number;     // evenness: velocity variation % of normal notes
  maxGhostToAccent?: number;  // dynamics: ghost (or unaccented) volume / accent volume
  maxSpreadMs?: number;       // consistency: std dev of hit offsets
  maxFlamMs?: number;         // limbs meant to land together: mean split between them
  maxPairDropPct?: number;    // doubles: how much softer the 2nd note of each pair may be
  streak?: number;            // a mini challenge: this many notes in a row replaces the accuracy and extra-hit bars
};
export const DEFAULT_PASS: Pass = { accuracy: 90, maxExtraPct: 15 };
/** The bar grows with the stage: beginners pass at 75% and stray strokes barely count. */
export const passFor = (level: number): Pass =>
  ({ accuracy: [75, 75, 80, 80, 85, 85][level] ?? 90, maxExtraPct: level <= 1 ? 40 : level <= 3 ? 25 : 15 });
/** Good window (ms) by level: wider while you're finding the click. */
export const goodMsFor = (level: number) => (level <= 1 ? 150 : 100);

export type Step = {
  title: string; text: string; chart: Chart;
  activeLanes?: ChartDrum[];  // lanes the student plays; omitted = all
  bpm: { start: number; target: number };
  pass?: Partial<Pass>;
  gapBars?: number;
  jam?: boolean;  // play along for fun: any full take counts, the tempo stays put
  copy?: boolean; // call and response: the app plays each bar, you echo it (see copyChart)
};
export type LessonKind = NonNullable<Chart['kind']>;
export type Lesson = {
  id: string; level: number; kind: LessonKind; title: string;
  what: string; why: string; how: string;
  steps: Step[]; tags?: Genre[];
  source?: 'ai'; focus?: string; // AI-curated for this student; `focus` says why
  checkpoint?: string; // a coach lesson that stands in for this checkpoint: finishing it passes the checkpoint
};
/** A fixed point on the path: what you can do, proven by passing its checkpoint lessons. */
export type Milestone = { level: number; title: string; rank: string; canDo: string[]; checkpoints: string[] }; // rank: your title once it's passed
export type Profile = { goals: Genre[]; minutesPerDay: number; onboarded: boolean };
export type LessonProgress = {
  step: number; bpm: number; clean: number; fails: number; bestBpm: number;
  completedAt?: string; reviewStage: number; reviewDue?: string; // dates are local YYYY-MM-DD
  stars?: number; // best 1–3 earned when the lesson completes (older saves: none)
};

export type Tool = 'jam' | 'copy' | 'challenge' | 'drill';
/** Which coach tool a step uses (server/prompts/lesson.md). */
export const toolOf = (s: Step): Tool => (s.jam ? 'jam' : s.copy ? 'copy' : s.pass?.streak ? 'challenge' : 'drill');

/** Call and response: each bar is played by the app (call), then by you (echo). A 2-bar chart becomes 4 bars. */
export function copyChart(c: Chart): Chart {
  const bpb = beatsPerBar(c);
  const notes = c.notes.flatMap(n => {
    const bar = Math.floor(n.t / bpb + 1e-6), t = n.t + bar * bpb;
    return [{ ...n, t, auto: true }, { ...n, t: t + bpb }];
  }).sort((a, b) => a.t - b.t);
  return { ...c, bars: c.bars * 2, notes };
}

export const CLEAN_TAKES = 2, FAILS_BEFORE_SLOWDOWN = 2, BPM_STEP = 5, MIN_BPM = 40, ROUGH_ACCURACY = 60;
export const REVIEW_DAYS = [2, 5, 12, 30];

export const startProgress = (l: Lesson): LessonProgress =>
  ({ step: 0, bpm: l.steps[0].bpm.start, clean: 0, fails: 0, bestBpm: 0, reviewStage: 0 });

/**
 * Did this take pass? `reason` is the one thing to fix, in plain words. With a `level`, the bar is that level's
 * (`passFor`) and a lesson may relax it but not make it stricter.
 */
export function checkPass(s: RunStats, p?: Partial<Pass>, level?: number): { ok: boolean; reason?: string } {
  const base = level === undefined ? DEFAULT_PASS : passFor(level);
  const c = level === undefined ? { ...base, ...p }
    : { ...base, ...p, accuracy: Math.min(base.accuracy, p?.accuracy ?? 100), maxExtraPct: Math.max(base.maxExtraPct, p?.maxExtraPct ?? 0) };
  if (s.reaction) return { ok: false, reason: `You're hitting ${s.reaction} ms after each click. Play with the click, not after it.` };
  if (c.streak !== undefined) {
    if (s.streak < c.streak) return { ok: false, reason: `Best run: ${s.streak} in a row, aiming for ${c.streak}. ${worstDrum(s)}`.trim() };
  } else {
    if (s.accuracy < c.accuracy) return { ok: false, reason: worstDrum(s) || 'A few notes slipped away from the click.' };
    if (s.total && (s.extra / s.total) * 100 > c.maxExtraPct) return { ok: false, reason: `${s.extra} extra hits. Play only the notes shown.` };
  }
  if (c.maxAbsOffsetMs !== undefined && Math.abs(s.meanOffset) > c.maxAbsOffsetMs)
    return { ok: false, reason: `${s.meanOffset < 0 ? 'Rushing' : 'Dragging'} by ${Math.abs(s.meanOffset)} ms. Lock onto the click.` };
  if (c.maxVelocityCv !== undefined && s.velocity.normalCv > c.maxVelocityCv)
    return { ok: false, reason: `Volume varies by ${s.velocity.normalCv}%. Aim for every stroke the same height.` };
  if (c.maxGhostToAccent !== undefined) {
    const soft = s.velocity.ghostMean ?? s.velocity.normalMean, loud = s.velocity.accentMean;
    if (loud && soft / loud > c.maxGhostToAccent) return { ok: false, reason: 'Make the accents louder and the other notes softer.' };
  }
  if (c.maxSpreadMs !== undefined && s.spread > c.maxSpreadMs)
    return { ok: false, reason: `Your hits wander ±${s.spread} ms. Keep each one the same distance from the click.` };
  if (c.maxFlamMs !== undefined && s.flam !== null && s.flam > c.maxFlamMs)
    return { ok: false, reason: `Hands and feet split by ${s.flam} ms. Make them land as one sound.` };
  if (c.maxPairDropPct !== undefined && s.velocity.pairDrop !== null && s.velocity.pairDrop > c.maxPairDropPct)
    return { ok: false, reason: `The second note of each double is ${s.velocity.pairDrop}% softer. Let it bounce, then help it with your fingers.` };
  return { ok: true };
}

function worstDrum(s: RunStats) {
  const worst = Object.entries(s.perDrum).sort((a, b) => a[1].accuracy - b[1].accuracy)[0];
  if (!worst || worst[1].accuracy >= 90) return '';
  const name = worst[0] === 'hhOpen' ? 'open hi-hat' : worst[0] === 'hhPedal' ? 'hi-hat foot' : worst[0] === 'hihat' ? 'hi-hat' : worst[0];
  const t = worst[1].meanOffset;
  const when = Math.abs(t) >= 15 ? `${t < 0 ? 'early' : 'late'} by ${Math.abs(t)} ms` : '';
  // One drum only: "weakest" means nothing, the timing hint is the useful part.
  if (Object.keys(s.perDrum).length === 1) return when ? `On average you were ${when}.` : '';
  return `The ${name} was weakest${when ? ` (${when})` : ''}.`;
}

/**
 * Stars for the take that completed a lesson (always at the target tempo):
 * ★ passed · ★★ ≥95% on time and ≤5% extra hits · ★★★ ≥98%, ≤2% extra, ≥70% of notes perfect and spread ≤15 ms.
 */
export function starsFor(s: RunStats): 1 | 2 | 3 {
  const extraPct = s.total ? (s.extra / s.total) * 100 : 0, perfectPct = s.total ? (s.perfect / s.total) * 100 : 0;
  if (s.accuracy >= 98 && extraPct <= 2 && perfectPct >= 70 && s.spread <= 15) return 3;
  if (s.accuracy >= 95 && extraPct <= 5) return 2;
  return 1;
}

export type LadderEvent = 'up' | 'hold' | 'slowDown' | 'atFloor' | 'stepDone' | 'lessonDone';

/**
 * Tempo ladder that keeps you in the sweet spot. Pass: CLEAN_TAKES clean takes → +5 BPM up to the target, then the
 * next step; below the step's start tempo (you eased off) one clean take climbs +10. Fail: a rough take (under
 * ROUGH_ACCURACY % landed) → −10 at once; FAILS_BEFORE_SLOWDOWN close ones → −5. Never below MIN_BPM ('atFloor').
 * A `jam` step counts any take as clean.
 */
export function ladderStep(p: LessonProgress, lesson: Lesson, passed: boolean, today: string, accuracy?: number): { next: LessonProgress; event: LadderEvent } {
  const step = lesson.steps[Math.min(p.step, lesson.steps.length - 1)];
  const last = p.step >= lesson.steps.length - 1;
  if (step.jam) passed = true;
  if (!passed) {
    const fails = p.fails + 1, rough = accuracy !== undefined && accuracy < ROUGH_ACCURACY;
    if (!rough && fails < FAILS_BEFORE_SLOWDOWN) return { next: { ...p, clean: 0, fails }, event: 'hold' };
    if (p.bpm <= MIN_BPM) return { next: { ...p, clean: 0, fails: 0 }, event: 'atFloor' };
    return { next: { ...p, clean: 0, fails: 0, bpm: Math.max(MIN_BPM, p.bpm - (rough ? 2 * BPM_STEP : BPM_STEP)) }, event: 'slowDown' };
  }
  const eased = p.bpm < step.bpm.start;
  const clean = p.clean + 1;
  const bestBpm = last ? Math.max(p.bestBpm, p.bpm) : p.bestBpm;
  if (step.jam) {
    if (!last) return { next: { ...p, step: p.step + 1, bpm: lesson.steps[p.step + 1].bpm.start, clean: 0, fails: 0, bestBpm }, event: 'stepDone' };
  } else {
    if (clean < CLEAN_TAKES && !eased) return { next: { ...p, clean, fails: 0, bestBpm }, event: 'hold' };
    if (p.bpm < step.bpm.target) return { next: { ...p, clean: 0, fails: 0, bestBpm, bpm: Math.min(step.bpm.target, p.bpm + (eased ? 2 : 1) * BPM_STEP) }, event: 'up' };
    if (!last) return { next: { ...p, step: p.step + 1, bpm: lesson.steps[p.step + 1].bpm.start, clean: 0, fails: 0, bestBpm }, event: 'stepDone' };
  }
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
