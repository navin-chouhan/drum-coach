// After a take: the take card (notes landed, stars, chips), the results on the sheet's notes (last round), the timing
// line, the latency hint, "one thing to fix" with Fix bar N, and the fills you can keep. Ported from
// src/lesson/LessonPlayer.tsx (the result card, `take`, yourFills), src/play/AtKit.tsx (TimingLine) and
// src/play/Results.tsx (LatencyHint).
import type { Chart } from '@drum-coach/core/engine/chart';
import { inFreeBar } from '@drum-coach/core/engine/jam';
import { MIN_BPM, starsFor } from '@drum-coach/core/engine/lesson';
import { LATENCY_PATH_IPAD, latencyLine } from '@drum-coach/core/engine/results';
import { WINDOWS } from '@drum-coach/core/engine/scoring';
import { lastRound, type NoteMark } from '@drum-coach/core/engine/takeMarks';
import { fillFromTake } from '@drum-coach/core/engine/transcribe';
import type { ChartNote } from '@drum-coach/core/engine/chart';
import type { Outcome } from './judge';
import { cleanCount, cleanNeeded, perTakeOf, type Frame, type LessonSetup } from './lessonView';
import type { Finished } from './types';
import type { LessonProgress } from '@drum-coach/core/engine/lesson';

export const beatMsOf = (f: Finished) => 60000 / (f.chart.bpm * f.options.speed);

export type TakeCard = {
  /** "46" of "/48 notes landed", or "92%" "on the beat" for a take of only your own bars. */
  big: string; unit: string; label: string;
  stars: number;
  needed?: string;
  chips: string[];
  /** One thing to fix (the verdict's reason). */
  reason?: string;
  small: string;
  passed: boolean;
};

/** The take card (the results side column). Undefined when the outcome has no numbers or a take is playing. */
export function takeCard(setup: LessonSetup, frame: Frame, chart: Chart, p: LessonProgress, f: Finished, o: Outcome): TakeCard | undefined {
  const shown = o.nums;
  if (!shown) return undefined;
  const { step, layer } = frame;
  const lit = o.passed && shown.total ? starsFor(f.stats) : 0;
  const { accuracy } = perTakeOf(setup, frame, chart);
  const needed = shown.total && !step.jam && !step.pass?.streak && !o.zoomed && !frame.oneTake ? Math.ceil((shown.total * accuracy) / 100) : undefined;
  const feel = f.stats.feel;
  const behind = step.pass?.offsetTarget ? f.stats.perDrum[step.pass.offsetTarget.drum ?? 'snare']?.meanOffset ?? f.stats.meanOffset : undefined;
  const chips: string[] = [];
  if (shown.total > 0) chips.push(`${shown.streak} in a row`);
  if (shown.recoveries > 0) chips.push(`${shown.recoveries} comebacks`);
  if (shown.onBeat !== undefined && shown.total > 0) chips.push(`your bars ${shown.onBeat}% on the beat`);
  if (step.pass?.swingPct && feel?.swing != null) chips.push(`${Math.round(feel.swing)}% swing (aim ${step.pass.swingPct.join('–')})`);
  if (step.pass?.minDynamicsR !== undefined && feel?.dynamics != null) chips.push(`soft / loud ${feel.dynamics >= step.pass.minDynamicsR ? '✓' : '✗'}`);
  if (step.pass?.offsetTarget && behind !== undefined) chips.push(`${Math.round(behind)} ms behind (aim ${step.pass.offsetTarget.ms - step.pass.offsetTarget.tol}–${step.pass.offsetTarget.ms + step.pass.offsetTarget.tol})`);
  const ladderLine = !frame.oneTake && !step.jam && !o.itemDone && (layer === undefined || layer === step.layers!.length - 1) ? cleanCount(p.clean, cleanNeeded(step), p.bpm) : '';
  return {
    big: shown.total > 0 ? String(shown.landed) : shown.onBeat !== undefined ? `${shown.onBeat}%` : '0',
    unit: shown.total > 0 ? `/${shown.total}` : '',
    label: shown.total > 0 ? 'notes landed' : 'on the beat',
    stars: lit, needed: needed !== undefined ? `${needed} needed` : undefined, chips, reason: o.reason,
    small: `${shown.better ? '↑ better than last take · ' : ''}${ladderLine}`, passed: o.passed,
  };
}

/** Every stroke off by the same amount: point at the latency test (core's words, the iPad's path; QA4 m4). */
export const latencyHint = (f: Finished): string | undefined => latencyLine(f, LATENCY_PATH_IPAD);

export type TakeMarks = { marks: Map<number, NoteMark>; extras: number[]; offsets: number[]; missed: number; mark: (i: number) => NoteMark | undefined };
/** How each note of the take's last round went, on the sheet (only when the take played the chart on screen). */
export function takeMarks(f: Finished | undefined, chart: Chart, playing: boolean): TakeMarks | undefined {
  if (!f || playing || f.options.demo || f.options.wait || !f.results.length) return undefined;
  const same = f.chart.notes.length === chart.notes.length && f.chart.notes.every((n, i) => n.t === chart.notes[i].t && n.drum === chart.notes[i].drum);
  if (!same) return undefined;
  const r = lastRound(chart, f.run, f.results, f.options, f.extras.map(h => (h.time - f.zero) / beatMsOf(f)));
  return { ...r, mark: (i: number) => r.marks.get(i) };
}

export type TimingDot = { x: number; ms: number; onIt: boolean; row: -1 | 0 | 1 };
/** The timing line: one dot per hit (x in 0..1000, the click at 500), the "right on it" zone and the caption. */
export function timingLine(offsets: number[], missed: number, extra: number, zone = WINDOWS.perfect) {
  if (!offsets.length) return undefined;
  const range = Math.max(150, Math.ceil(Math.max(...offsets.map(Math.abs)) / 50) * 50), x = (ms: number) => 500 + (ms * 420) / range;
  const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
  return {
    range, zone: { from: x(-zone), to: x(zone) }, mean,
    dots: offsets.map((ms, k): TimingDot => ({ x: x(ms), ms, onIt: Math.abs(ms) <= zone, row: ((k % 3) - 1) as -1 | 0 | 1 })),
    caption: `${offsets.length} hit${offsets.length === 1 ? '' : 's'}${missed ? `, ${missed} missed` : ''}${extra ? `, ${extra} extra` : ''} · on average ${Math.abs(mean) < 10 ? 'right on the click' : `${Math.round(Math.abs(mean))} ms ${mean > 0 ? 'after' : 'before'} the click`}`,
    label: `Your hits against the click: on average ${Math.round(mean)} ms`,
  };
}

/** Fix bar N: loop one bar 4 times, 10 BPM slower, with the app playing softly underneath. */
export const fixBar = (bar: number, bpm: number) => ({ bar, bpm: Math.max(MIN_BPM, bpm - 10), label: `🔍 Fix bar ${bar}`, detail: `Fix bar ${bar} · 4× at ${Math.max(MIN_BPM, bpm - 10)}` });

/** Your fills: each free bar of the last take with 2+ strokes can be kept (up to 4 per take). */
export function yourFills(f: Finished | undefined, playing: boolean): { bar: number; notes: ChartNote[] }[] {
  if (!f || !f.options.freeBars || playing) return [];
  const free = f.options.freeBars, bpb = f.run.beatsPerBar;
  return Array.from({ length: Math.ceil(f.run.beats / bpb) }, (_, b) => b)
    .filter(b => inFreeBar(b * bpb, bpb, f.options.fromBar, f.options.toBar - f.options.fromBar + 1, free))
    .map(b => ({ bar: b, notes: fillFromTake(f.hits, { zero: f.zero, beatMs: beatMsOf(f), beatsPerBar: bpb }, b) }))
    .filter(x => x.notes.length >= 2).slice(0, 4);
}

/** The take's tempo and section, for the results header ("70 BPM · take 2"). */
export const takeBpm = (f: Finished) => Math.round(f.chart.bpm * f.options.speed);
