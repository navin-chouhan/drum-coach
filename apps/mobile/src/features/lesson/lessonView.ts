// The lesson before (and around) a take: which step, tempo, chart and lanes; the take's options; the top bar (step
// pills, tempo ladder); the goal; the lesson card. Ported from src/lesson/LessonPlayer.tsx (the `Lesson` component's
// derived values), src/lesson/tools.ts and src/play/AtKit.tsx (TempoLadder). Pure: no React, no storage.
import { bandFor } from '@drum-coach/core/engine/band';
import { beatsPerBar, type Chart, type ChartDrum } from '@drum-coach/core/engine/chart';
import {
  autoProbe, CLEAN_TAKES, countPlan, goodMsFor, lanesNow, passFor, pickVariant, playChart, recordTarget, toolOf,
  type Lesson, type LessonProgress, type Step, type Tool,
} from '@drum-coach/core/engine/lesson';
import { drumName } from '@drum-coach/core/engine/liveCoach';
import type { SessionRole } from '@drum-coach/core/engine/planner';
import type { Settings } from '@drum-coach/core/input/settings';
import type { PlayOptions } from './types';

export const ROLE: Record<SessionRole, string> = { stretch: 'Stretch', warmup: 'Warm-up', review: 'Review', skill: 'New skill', groove: 'Groove', record: 'Beat your best' };
// src/lesson/tools.ts
export const TOOL_LABEL: Record<Tool, string> = { jam: 'Play along', copy: 'I play, you copy', trade: 'Trade bars', free: 'Your own fill', bite: 'Song bite', challenge: 'Mini challenge', layers: 'One limb at a time', drill: 'Practice' };
const KIND_ICON: Record<string, string> = { groove: '🥁', rudiment: '🥢', fill: '💥', song: '🎵', exercise: '🎯' };
const TOOL_ICON: Record<Tool, string> = { jam: '🎸', copy: '🔁', trade: '🤜', free: '✨', bite: '🎵', challenge: '🔥', layers: '🧱', drill: '' };
export const stepIcon = (s: Step, kind: string) => TOOL_ICON[toolOf(s)] || KIND_ICON[kind] || '🎯';
/** The web's lane names (LessonPlayer laneName = liveCoach drumName). */
export const laneName = (d: string) => drumName(d);

/** How the lesson was opened (LessonPlayer props). */
export type LessonSetup = {
  lesson: Lesson;
  role?: SessionRole;
  /** Minutes this item has in today's session. */
  minutes?: number;
  /** Flow mode: the groove loops until you stop, the click fades out, nothing to pass. */
  flow?: boolean;
  /** Beat the clock: 2 minutes at your best tempo, score = clean bars. */
  arcade?: boolean;
  /** Opened from today's session (there's a next item); else Next goes back to Journey. */
  hasNext: boolean;
  /** A coach drill or plan item (/lesson/chart): one take, no lesson progress. */
  drill?: boolean;
};

/** Clean takes a step needs at one tempo: a streak challenge is done on its first pass. */
export const cleanNeeded = (s: { pass?: { streak?: number } }) => (s.pass?.streak ? 1 : CLEAN_TAKES);
export const cleanCount = (clean: number, need: number, bpm: number) =>
  `${clean} of ${need} clean take${need === 1 ? '' : 's'} at ${bpm} BPM${need > 1 ? ' (one ★★★ take counts as both)' : ''}`;

export type Frame = {
  stepIdx: number; step: Step; lastStep: boolean;
  oneTake: boolean;
  /** Beat your best on a streak challenge: the streak to beat. */
  recordStreak?: number;
  bpm: number;
  lanes?: ChartDrum[];
  /** The layer index of a `layers` step (not for one-take items). */
  layer?: number;
  stitchedSong: boolean;
  /** A rest, look, quiz, transcribe or listen step: no playing, "done" moves on. */
  resting: boolean;
  /** Arcade (beat the clock) plays at your best tempo. */
  arcadeBpm: number;
};

/** Which step and tempo the lesson is on (LessonPlayer lines 88–112). */
export function frameOf(setup: LessonSetup, p: LessonProgress, routineStep = 0): Frame {
  const { lesson, role } = setup;
  const oneTake = role === 'warmup' || role === 'review' || role === 'record' || !!setup.drill;
  const stepIdx = role === 'stretch' ? Math.min(routineStep, lesson.steps.length - 1) : oneTake ? lesson.steps.length - 1 : Math.min(p.step, lesson.steps.length - 1);
  const step = lesson.steps[stepIdx];
  const recordStreak = role === 'record' ? recordTarget(step, p) : undefined;
  const bpm = role === 'record' && !recordStreak ? (p.bestBpm || step.bpm.target) + 5 : oneTake ? Math.max(step.bpm.start, p.bestBpm || step.bpm.target) : p.bpm;
  const lanes = oneTake ? step.layers?.at(-1) ?? step.activeLanes : lanesNow(step, p);
  const layer = step.layers && !oneTake ? Math.min(p.layer ?? 0, step.layers.length - 1) : undefined;
  return {
    stepIdx, step, lastStep: stepIdx === lesson.steps.length - 1, oneTake, recordStreak, bpm, lanes, layer,
    stitchedSong: lesson.id.startsWith('song-yt-'),
    resting: (!!step.rest || !!step.look || !!step.quiz || !!step.transcribe || !!step.listen) && !oneTake,
    arcadeBpm: p.bestBpm || step.bpm.target,
  };
}

/** The phrase a take plays (shuffle the phrases: a new variant per take), with its free bars. */
export function chartFor(step: Step, takeNo: number, seedBase: number): { chart: Chart; freeBars: number[] } {
  return playChart(step.variants?.length
    ? { ...step, chart: { ...[step.chart, ...step.variants][pickVariant(step.variants.length + 1, takeNo + seedBase)], id: step.chart.id } }
    : step);
}
/** The variant seed, fixed when the lesson opens (LessonPlayer seedBase). */
export const seedBaseOf = (p: LessonProgress) => p.clean + p.fails + p.step * 7;

/** Bars per take, as repeats of the chart: 4 bars; 8 for the proving take, a jam, copy-me and a record; a song once. */
export function repeatsFor(setup: LessonSetup, f: Frame, chart: Chart): number {
  const { step } = f;
  if (f.stitchedSong) return 1;
  if (step.bars) return Math.max(1, Math.ceil(step.bars / chart.bars));
  const eight = step.copy || step.trade || step.jam || setup.role === 'record' || (f.lastStep && f.bpm >= step.bpm.target);
  return Math.max(1, Math.ceil((eight ? 8 : 4) / chart.bars));
}

/** The take's options (LessonPlayer `options`). */
export function takeOptions(setup: LessonSetup, f: Frame, chart: Chart, free: number[], s: Settings, demo: boolean, wait = false): PlayOptions {
  const { lesson } = setup, { step } = f;
  return {
    fromBar: 1, toBar: chart.bars, repeats: repeatsFor(setup, f, chart),
    speed: f.bpm / chart.bpm, metronome: true, subdivision: 1, countInBars: 1, wait,
    countAloud: step.countAloud && countPlan(16, beatsPerBar(chart), step.countAloud, chart.timeSignature),
    activeLanes: f.lanes, demo, gapBars: demo ? undefined : step.gapBars, count: lesson.level <= 1, goodMs: goodMsFor(lesson.level),
    hints: s.hints !== false && !step.read, freeBars: free.length ? free : undefined, fadeClick: demo ? undefined : step.fadeClick, clickOn: step.clickOn,
    lesson: {
      id: lesson.id, step: f.stepIdx + 1, title: lesson.title, goal: step.text, tool: setup.flow ? 'flow' : setup.arcade ? 'arcade' : toolOf(step),
      ...(step.bite && { bite: { songId: step.bite.songId, fromBar: step.bite.fromBar, toBar: step.bite.toBar } }),
    },
    band: s.band !== false ? bandFor(lesson, step) : undefined,
    feelTarget: step.pass?.offsetTarget && { ms: step.pass.offsetTarget.ms, tol: step.pass.offsetTarget.tol },
    swingWant: step.pass?.swingPct,
  };
}

/** Find your tempo: only an untouched step (a flying student probes every drill step). */
export function canProbe(f: Frame, p: LessonProgress, pace: string, probedStep: number | undefined): boolean {
  const { step } = f;
  return (!!step.probe || autoProbe(step, pace)) && !f.oneTake && probedStep !== f.stepIdx && p.bpm === step.bpm.start && !p.clean && !p.fails;
}

export type Pill = { name: string; state: 'done' | 'now' | '' };
/** The steps (or a step's layers) as pills: numbers, and the name of the one you're on. */
export function pillsOf(lesson: Lesson, f: Frame, p: LessonProgress): { pills: Pill[]; label: string } {
  const { step } = f;
  if (step.layers && !f.oneTake) {
    const layers = step.layers, layer = f.layer!;
    const pills = layers.map((l, i): Pill => ({
      name: i ? `+ ${l.filter(d => !layers[i - 1].includes(d)).map(laneName).join(' + ')}` : l.map(laneName).join(' + '),
      state: i < layer ? 'done' : i === layer ? 'now' : '',
    }));
    return { pills, label: `Layer ${layer + 1} of ${pills.length}` };
  }
  const pills = lesson.steps.map((st, i): Pill => ({ name: st.title, state: i < f.stepIdx || p.completedAt ? 'done' : i === f.stepIdx ? 'now' : '' }));
  return { pills, label: `Step ${f.stepIdx + 1} of ${pills.length}` };
}

/** The top bar's title block: the web's sub line (icon, coach-written, role or tool) and the mockup's "Step 3 of 4". */
export function headerOf(setup: LessonSetup, f: Frame, p: LessonProgress) {
  const { lesson, role } = setup;
  const { pills, label } = pillsOf(lesson, f, p);
  return {
    title: lesson.title,
    sub: `${stepIcon(f.step, lesson.kind)} ${lesson.source === 'ai' ? '✍ your coach wrote this one · ' : ''}${role ? ROLE[role] : TOOL_LABEL[toolOf(f.step)]}`,
    stepOf: label,
    pills: pills.length > 1 ? pills : [],
    tempo: setup.arcade ? f.arcadeBpm : f.bpm,
    /** The ladder shows for a normal lesson take (not one-take items, arcade or flow). */
    ladder: !f.oneTake && !setup.arcade && !setup.flow ? ladderRungs(f.bpm, f.step.bpm.start, f.step.bpm.target) : undefined,
  };
}

export type Rung = { bpm: number; at: boolean; start: boolean; goal: boolean };
/** The tempo ladder: one rung per 5 BPM from the start to the goal (at most 12); the rung you're on is marked. */
export function ladderRungs(bpm: number, start: number, target: number): { rungs: Rung[]; caption: string } {
  const lo = Math.min(bpm, start), n = Math.floor((target - lo) / 5) + 1, every = Math.ceil(n / 12);
  const list = Array.from({ length: Math.ceil(n / every) }, (_, k) => lo + k * every * 5);
  if (list[list.length - 1] < target) list.push(target);
  const at = [...list].reverse().find(b => b <= bpm);
  return { rungs: list.map(b => ({ bpm: b, at: b === at, start: b === start, goal: b === target })), caption: `start ${start} · goal ${target}` };
}

/** Rich text the screens render: `bold` first, then `text`, with an optional small line under it. */
export type Goal = { bold: string; text: string; small?: string };

/** Notes a take asks for, and how many make it clean. */
export function perTakeOf(setup: LessonSetup, f: Frame, chart: Chart) {
  const perTake = chart.notes.filter(n => !n.auto && (!f.lanes || f.lanes.includes(n.drum))).length * repeatsFor(setup, f, chart);
  const accuracy = Math.min(passFor(setup.lesson.level).accuracy, f.step.pass?.accuracy ?? 100);
  return { perTake, accuracy, clean: Math.ceil((perTake * accuracy) / 100) };
}

/** The goal, in words, before the take: how many clean takes, what "clean" means, what happens then. */
export function goalOf(setup: LessonSetup, f: Frame, chart: Chart, free: number[]): Goal {
  const { role } = setup, { step, bpm } = f;
  const { perTake, clean } = perTakeOf(setup, f, chart);
  const need = cleanNeeded(step);
  if (setup.arcade) return { bold: 'Two minutes', text: ` at ${f.arcadeBpm} BPM: every clean bar counts.` };
  if (setup.flow) return { bold: 'Just play.', text: ' Nothing to pass.' };
  if (step.jam) return { bold: 'Any full take', text: ' counts. Just play along and enjoy it.' };
  if (role === 'review') return { bold: 'One take', text: ` at ${bpm} BPM: does it still sit?` };
  if (setup.drill) return { bold: 'One take', text: ` at ${bpm} BPM.` };
  if (role === 'warmup' || role === 'stretch') return { bold: 'One take', text: ' to warm up.' };
  if (role === 'record') return { bold: f.recordStreak ? `${f.recordStreak} in a row` : `${bpm} BPM`, text: ' beats your record.' };
  if (step.pass?.streak) return { bold: `${step.pass.streak} notes in a row`, text: ` and ${f.lastStep ? 'the lesson is done' : 'on to the next step'}.`, small: 'Miss one and the count starts again.' };
  if (step.trade || (free.length > 0 && !perTake)) return { bold: 'Your bars:', text: ' anything you like, on the beat.' };
  if (f.layer !== undefined && f.layer < step.layers!.length - 1) {
    const next = step.layers![f.layer + 1].find(d => !step.layers![f.layer!].includes(d)) ?? '';
    return { bold: 'A clean take', text: ` adds the ${laneName(next)}.`, small: `Clean = ${clean} of ${perTake} notes land.` };
  }
  return {
    bold: `${need} clean take${need === 1 ? '' : 's in a row'}`,
    text: ` and ${bpm < step.bpm.target ? `the tempo goes up to ${Math.min(step.bpm.target, bpm + 5)}` : f.lastStep ? 'the lesson is done' : 'on to the next step'}.`,
    small: `Clean = ${clean} of ${perTake} notes land${step.pass?.maxAbsOffsetMs ? `, and on average no more than a hair (${step.pass.maxAbsOffsetMs} ms) off the click` : ''}.`,
  };
}

/** The tick boxes next to the goal: clean takes so far (a normal ladder step at its last layer only). */
export function boxesOf(setup: LessonSetup, f: Frame, p: LessonProgress): { n: number; ok: number } | undefined {
  const { step } = f;
  return !f.oneTake && !step.jam && !setup.arcade && !setup.flow && !step.pass?.streak && (f.layer === undefined || f.layer === step.layers!.length - 1)
    ? { n: cleanNeeded(step), ok: p.clean } : undefined;
}

/** The pads you play this take (the kit view's lit pads). */
export const myPadsOf = (f: Frame, chart: Chart): ChartDrum[] => f.lanes ?? [...new Set(chart.notes.filter(n => !n.auto).map(n => n.drum))];

/** The coach line before a take when there's no verdict: arcade, find your tempo, flow, or the step's text. */
export function introLine(setup: LessonSetup, f: Frame, probing: { can: boolean; explained: boolean }, arcadeBest: number): string {
  if (setup.arcade) return `Two minutes at ${f.arcadeBpm} BPM: how many clean bars can you play? ${arcadeBest ? `Your best: ${arcadeBest}.` : ''}`;
  if (probing.can) return probing.explained ? `Find your tempo from ${f.step.bpm.start} BPM.` : "Let's find your tempo: one bar at a time, 5 BPM faster after each clean bar, until it gets hard.";
  if (setup.flow) return 'Flow: just play. The click fades away and nothing is scored as pass or fail. Stop when you like (crash × 4 or Esc).';
  return f.step.text;
}

/** The lesson card (⋯ The lesson): what, the layer, the hint, the step's notes, why and how. */
export function lessonCardOf(setup: LessonSetup, f: Frame, free: number[], s: Settings): { what: string; lines: string[]; hint?: string; why: string; how: string } {
  const { lesson } = setup, { step } = f;
  const hints = s.hints !== false && !step.read;
  const lines: string[] = [];
  if (f.layer !== undefined) lines.push(`Layer ${f.layer + 1} of ${step.layers!.length}: a clean take adds ${laneName(step.layers![f.layer + 1]?.find(d => !step.layers![f.layer!].includes(d)) ?? 'speed')}.`);
  if (step.probe) lines.push(`Find your tempo: one bar at a time from ${step.bpm.start} BPM, faster after each clean bar. Then we practise just below where it got hard.`);
  if (step.fadeClick) lines.push(`The click fades away over ${step.fadeClick} bars. Keep the tempo on your own.`);
  if (step.clickOn === '2and4') lines.push('The click is only on 2 and 4, like a snare backbeat. Feel 1 and 3 yourself.');
  if (step.clickOn === '8ths') lines.push('The click is on every 8th note.');
  if (step.variants?.length) lines.push("A different phrase each take: read it, don't memorise it.");
  if (step.read) lines.push('📖 Reading: no hints under the notes. Count it in your head first, then play what you see.');
  // The iPad counts along with its own voice (D6), so the web's "needs the Piper voice" branch never applies.
  if (step.countAloud) lines.push('I count along with you for the first bars, then you take over.');
  if (step.trade) lines.push('Trade bars: I play a bar, you answer with anything. No wrong notes, just stay on the beat.');
  if (!step.trade && free.length > 0) lines.push(`Bar ${free.join(' and ')} is yours: play any fill you like.`);
  if (step.gapBars) lines.push(`The click goes silent every ${step.gapBars === 2 ? 'other' : `${step.gapBars}th`} bar.`);
  return { what: lesson.what, lines, hint: hints ? howHint(lesson) : undefined, why: lesson.why, how: lesson.how };
}
/** The lesson's first "how" sentence: the 💡 hint. */
export const howHint = (l: Lesson) => l.how.split(/(?<=\.)\s/)[0];

/** A quarter / 8th chart is counted in 8ths on the sheet: the ones you only say are blue. */
export function sayOnly(hints: boolean, chart: Chart, lanes?: ChartDrum[]): boolean {
  return hints && chart.timeSignature[1] === 4 && chart.notes.every(n => Math.abs(n.t * 2 - Math.round(n.t * 2)) < 1e-3)
    && new Set(chart.notes.filter(n => !n.auto && (!lanes || lanes.includes(n.drum))).map(n => n.t)).size < chart.bars * beatsPerBar(chart) * 2;
}

/** The idle sheet: a note is dimmed where the app plays it (other lanes, copy-me calls). */
export const dimmed = (chart: Chart, lanes?: ChartDrum[]) => (i: number) => !!chart.notes[i].auto || (!!lanes && !lanes.includes(chart.notes[i].drum));
