// Sheet music on the iPad: everything that isn't drawing. Pure TypeScript (Vitest-tested), shared by the native side
// (NotationView.tsx) and the DOM component (dom/SheetDom.tsx, which runs in a WebView).
//
// What notes are in which bar, their durations, the count/limb hints and the cursor interpolation come from the core
// (packages/core/src/engine/notation.ts), exactly as on the web. This file adds the play-view parts the web keeps in
// src/notation/SheetMusic.tsx (page size, colours) and the parts the WebView bridge needs (result log, clock sync).
// No runtime imports of zod or React Native here: the DOM bundle includes this file.
import { xAtBeat } from '@drum-coach/core/engine/notation';
import type { ChartNote } from '@drum-coach/core/engine/chart';
import { estimateOffset, nextOffset, type OffsetSample } from '../play/clockSync';
import { resultKind, type PlayResult } from '../play/events';
import type { PlayTheme, ResultKind } from '../play/theme';

// ---------------------------------------------------------------------------------------------------------------
// Chart

/** The chart as it crosses the bridge (JSON): the core's notes, unchanged and in the order results index them. */
export type SheetChart = { notes: ChartNote[]; timeSignature: [number, number]; bars: number; title?: string };

/**
 * Whether two charts draw the same sheet. Screens often build the chart object anew on every render (the lesson
 * player re-renders every 100 ms during a take: `runChart(state)` around the same run notes), so identity says
 * nothing: compare the notes array (the run's own) and the shape instead. A changed chart re-engraves the page and
 * restarts the cursor, and resets the take's colours, so a false "changed" every 100 ms kept the sheet from following.
 */
export function sameSheetChart(a: { notes: readonly unknown[]; timeSignature: readonly [number, number]; bars: number; title?: string } | undefined,
  b: { notes: readonly unknown[]; timeSignature: readonly [number, number]; bars: number; title?: string }): boolean {
  return !!a && a.notes === b.notes && a.bars === b.bars && a.title === b.title && a.timeSignature[0] === b.timeSignature[0] && a.timeSignature[1] === b.timeSignature[1];
}

export const beatsPerBarOf = (ts: readonly [number, number]): number => (ts[0] * 4) / ts[1];

/** Bars to draw: the chart's bars, or more when a note lies past them (a hand-made chart). */
export function totalBarsOf(chart: SheetChart): number {
  const bpb = beatsPerBarOf(chart.timeSignature);
  const last = chart.notes.reduce((m, n) => Math.max(m, n.t), -Infinity);
  return Math.max(1, chart.bars, Number.isFinite(last) ? Math.floor(last / bpb + 1e-6) + 1 : 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Page geometry (the web's SheetPlayer numbers: src/notation/SheetMusic.tsx)

// TOP leaves room above the first row for beams, accents and the open hi-hat's "o" (the web's play view clips them).
export const ROW_H = 120, HINT_H = 44, FIRST_EXTRA = 70, TOP = 30, BOTTOM = 10, BAR_MIN = 270, HINT_BAR_MIN = 320;
export const rowHeight = (hints: boolean): number => ROW_H + (hints ? HINT_H : 0);

/** The narrowest bar with hints: room for every syllable of the count (a bar of 16ths needs more than one of quarters). */
export function hintBarMin(notes: readonly { t: number }[], bpb: number): number {
  const per = new Map<number, Set<number>>();
  for (const n of notes) {
    const b = Math.floor(n.t / bpb + 1e-6);
    per.set(b, (per.get(b) ?? new Set()).add(Math.round(n.t * 1000)));
  }
  return Math.max(300, 24 * Math.max(0, ...[...per.values()].map(x => x.size)));
}

export type SheetGeometry = {
  /** Notation zoom (1 = VexFlow size). */
  scale: number;
  /** The narrowest bar before wrapping (unscaled). */
  barMin: number;
  perRow: number;
  rows: number;
  perPage: number;
  /** Unscaled width the engraver lays out in (the view width / scale). */
  width: number;
};

const MAX_SCALE = 1.6, MIN_AUTO_SCALE = 1.2, NARROW = 700, NARROW_SCALE = 1.1;

function fit(viewW: number, viewH: number, scale: number, barMin: number, hints: boolean): SheetGeometry {
  const width = Math.max(1, viewW - 16) / scale;
  const perRow = Math.max(1, Math.floor((width - FIRST_EXTRA - 10) / barMin));
  const rows = Math.max(1, Math.floor((viewH - (TOP + BOTTOM) * scale) / (rowHeight(hints) * scale)));
  return { scale, barMin, perRow, rows, perPage: perRow * rows, width };
}

/**
 * How many bars fit on a page of the view (px). Big notation read from the throne, like the web's lesson view (1.6×),
 * but never one bar per row on the iPad: the zoom steps down (to 1.2× at least) until two bars fit side by side, so the
 * page doesn't turn every bar. 1.1× under 700 wide. At least one bar and one row. `scale` fixes the zoom.
 */
export function sheetGeometry(viewW: number, viewH: number, o: { hints: boolean; notes: readonly { t: number }[]; bpb: number; scale?: number }): SheetGeometry {
  const barMin = o.hints ? Math.max(HINT_BAR_MIN, hintBarMin(o.notes, o.bpb)) : BAR_MIN;
  if (o.scale) return fit(viewW, viewH, o.scale, barMin, o.hints);
  if (viewW < NARROW) return fit(viewW, viewH, NARROW_SCALE, barMin, o.hints);
  let g = fit(viewW, viewH, MAX_SCALE, barMin, o.hints);
  for (let s = MAX_SCALE - 0.05; g.perRow < 2 && s >= MIN_AUTO_SCALE - 1e-9; s -= 0.05) g = fit(viewW, viewH, Math.round(s * 100) / 100, barMin, o.hints);
  return g.perRow < 2 ? fit(viewW, viewH, MAX_SCALE, barMin, o.hints) : g;
}

/** The bar (0-based) a position is in, clamped to the chart; the count-in is bar 0. */
export const barAt = (pos: number, bpb: number, totalBars: number): number => Math.max(0, Math.min(totalBars - 1, Math.floor(pos / bpb)));
export const pageOf = (bar: number, perPage: number): number => Math.floor(bar / Math.max(1, perPage));
/** A page's bars, 1-based and inclusive (the engraver's fromBar/toBar). */
export function pageBars(page: number, perPage: number, totalBars: number): { fromBar: number; toBar: number } {
  const fromBar = page * perPage + 1;
  return { fromBar, toBar: Math.min(totalBars, fromBar + perPage - 1) };
}
export const pageCount = (totalBars: number, perPage: number): number => Math.max(1, Math.ceil(totalBars / Math.max(1, perPage)));

/** Where a bar was drawn: its box and the x of each beat with a note (screen px from the SVG origin). */
export type MeasureBox = { index: number; x0: number; x1: number; y: number; points: { beat: number; x: number }[] };

/** The cursor for a position on a drawn page: the bar's box and the cursor's x, or null off the page. */
export function cursorAt(measures: readonly MeasureBox[], pos: number, bpb: number, fromBar: number): { box: MeasureBox; x: number } | null {
  const box = measures[Math.floor(pos / bpb) - (fromBar - 1)] ?? null;
  if (!box) return null;
  return { box, x: xAtBeat(box.points, pos) };
}

/** The beat count shown over the sheet: "1 2 3 4" in the count-in, "3 &" in a bar, empty before and after the take. */
export function countText(pos: number, bpb: number, totalBeats = Infinity): { text: string; countIn: boolean } {
  if (pos < -bpb || !Number.isFinite(pos)) return { text: '', countIn: true };
  if (pos >= totalBeats) return { text: '', countIn: false };
  if (pos < 0) return { text: String(((Math.floor(pos) % bpb) + bpb) % bpb + 1), countIn: true };
  const inBar = ((pos % bpb) + bpb) % bpb;
  return { text: `${Math.floor(inBar) + 1}${inBar % 1 >= 0.5 ? ' &' : ''}`, countIn: false };
}

// ---------------------------------------------------------------------------------------------------------------
// Colours

/** What the sheet draws in. Paper is always light (the web's sheet is paper on both themes). */
export type SheetColors = {
  paper: string;
  dots: string;
  ink: string;
  /** Notes the app plays (layered lessons). */
  dim: string;
  /** A syllable you say but don't play (the count under the staff). */
  say: string;
  cursor: string;
  frame: string;
  barTint: string;
  result: Record<ResultKind, string>;
};

/** The web sheet's own result tones (src/notation/SheetMusic.tsx TONE): readable on paper, unlike the web highway's. */
/** The sheet's colours for a play theme: paper, ink, and the theme's result colours for paper (`sheetResult`). */
export function sheetColors(theme: PlayTheme): SheetColors {
  return {
    paper: '#FFFDF6',
    dots: 'rgba(20,20,20,0.07)',
    ink: '#141414',
    dim: '#A3A3A3',
    say: '#2F6FE4',
    cursor: theme.nowLine.startsWith('rgba') ? '#FFE14D' : theme.nowLine,
    frame: '#141414',
    barTint: 'rgba(255,213,0,0.30)',
    result: { ...theme.sheetResult },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Results across the bridge

/** A result with its place in the take's log (seq from 0). `take` identifies the take (its zero). */
export type LoggedResult = { seq: number; r: PlayResult };
export type ResultBatch = { take: number; results: LoggedResult[] };

/**
 * The native side's log of the current take's results. The WebView may load (or reload, after iOS kills its process)
 * at any time, so it asks for everything so far once it's ready and then gets each new result as it comes.
 */
export function createResultLog() {
  let take = NaN, list: LoggedResult[] = [];
  return {
    /** Starts a new take: the old one's results are dropped. */
    reset(t: number) {
      take = t;
      list = [];
    },
    add(r: PlayResult): ResultBatch {
      const e = { seq: list.length, r };
      list.push(e);
      return { take, results: [e] };
    },
    /** Everything for take `t` (empty for another take). */
    since(t: number, fromSeq = 0): ResultBatch {
      return { take, results: t === take ? list.slice(fromSeq) : [] };
    },
    get take() {
      return take;
    },
  };
}

/** What the sheet shows: each note's latest result, and the extra strokes (in beats, latency removed). */
export type SheetMarks = { take: number; next: number; notes: Map<number, ResultKind>; extras: { seq: number; beat: number }[] };

export const emptyMarks = (take: number): SheetMarks => ({ take, next: 0, notes: new Map(), extras: [] });

/**
 * Adds a batch to the marks (the DOM side). A batch for another take is ignored; results already seen (by seq) are
 * skipped, so a replay after a reload and a live push can overlap. Returns the note indexes and extras that changed.
 */
export function mergeBatch(m: SheetMarks, b: ResultBatch, timing: { zero: number; beatMs: number; latencyMs: number }): { notes: number[]; extras: { seq: number; beat: number }[] } {
  const changed = { notes: [] as number[], extras: [] as { seq: number; beat: number }[] };
  if (b.take !== m.take) return changed;
  for (const { seq, r } of [...b.results].sort((a, c) => a.seq - c.seq)) {
    if (seq < m.next) continue;
    m.next = seq + 1;
    if (r.kind === 'judged') {
      m.notes.set(r.index, resultKind(r));
      changed.notes.push(r.index);
    } else {
      const beat = (r.at - timing.latencyMs - timing.zero) / timing.beatMs;
      if (!Number.isFinite(beat)) continue;
      const x = { seq, beat };
      m.extras.push(x);
      changed.extras.push(x);
    }
  }
  return changed;
}

const RANK: Record<ResultKind, number> = { onIt: 0, early: 1, late: 1, extra: 2, missed: 3 };
/** The worst of several results (a chord's word): missed beats early/late beats on it. */
export function worstKind(kinds: readonly (ResultKind | undefined)[]): ResultKind | undefined {
  let w: ResultKind | undefined;
  for (const k of kinds) if (k && (!w || RANK[k] > RANK[w])) w = k;
  return w;
}

// ---------------------------------------------------------------------------------------------------------------
// The Clock inside the WebView

/**
 * WKWebView's performance.now() has its own origin, so the DOM side measures Clock − performance.now() with round
 * trips: performance.now() before, the native Clock (a bridge call), performance.now() after; the tightest bracket
 * wins (src/play/clockSync.ts). A busy JS thread only widens a bracket, and a wide one loses.
 */
export async function measureClockOffset(clockNow: () => Promise<number>, perfNow: () => number, n = 5): Promise<number> {
  const samples: OffsetSample[] = [];
  for (let i = 0; i < n; i++) {
    const before = perfNow();
    const clock = await clockNow();
    const after = perfNow();
    samples.push({ before, clock, after });
  }
  return estimateOffset(samples);
}

export { nextOffset };

/** The take position (beats) the frame shows, from the WebView's performance.now(). */
export const positionFromPerf = (perfMs: number, offset: number, zero: number, beatMs: number, leadMs = 0): number => (perfMs + offset + leadMs - zero) / beatMs;
