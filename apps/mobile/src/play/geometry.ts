// Note-highway geometry: lanes, time → position, pages, grid, count and note glyphs. Pure TypeScript (Vitest-tested);
// the functions marked 'worklet' also run on the UI thread inside Reanimated frame callbacks.
//
// Two flows (the owner hasn't approved the iPad mockups yet, so both stay one option away):
// - 'leftward' (iPad mockups, default): lanes stacked like notation (cymbals on top, kick below), notes travel right to
//   left and cross a vertical now line; a count row ("1 & 2 &") runs under the lanes.
// - 'downward' (the web's src/play/Highway.tsx): lanes side by side in kit order, notes fall onto a hit line.
//
// Coordinates: the track is the scrolling area. Along the main (time) axis a beat sits at content position
// mainOf(beat); the renderer translates the content by scrollFor(pos), so beat `pos` is always at `nowAt`.
import { beatsPerBar, laneOf, type ChartLike, type ChartNoteLike, type DrumId } from './chartLike';
import type { PlayTheme } from './theme';

export type Flow = 'leftward' | 'downward';

/** Lanes top to bottom like a drum staff: crash above, hi-hat, ride, toms, snare, floor, kick at the bottom. */
export const NOTATION_LANES: readonly DrumId[] = ['crash', 'hihat', 'ride', 'tom1', 'tom2', 'snare', 'floor', 'kick'];
/** The web highway's order (src/play/Highway.tsx HIGHWAY_LANES): left to right as you sit, kick last. */
export const KIT_LANES: readonly DrumId[] = ['hihat', 'crash', 'snare', 'tom1', 'tom2', 'floor', 'ride', 'kick'];

export type HighwayOptions = {
  flow: Flow;
  /** Order of the lanes (top → bottom for leftward, left → right for downward). */
  laneOrder: readonly DrumId[];
  /** Which lanes to show: the chart's own ('chart'), all eight, or a list (drawn in laneOrder). */
  lanes: 'chart' | 'all' | readonly DrumId[];
  pxPerBeat: number;
  /** Share of the track that shows the past (behind the now line). */
  pastFraction: number;
  /** leftward: width of the lane-name column; downward: height of the lane-name row under the hit line. */
  gutter: number;
  /** leftward only: height of the "1 & 2 &" row under the lanes (0 = none). */
  countRow: number;
  /** leftward only: space above the lanes for "BAR 3". */
  headRoom: number;
  /** Bars per page: the highway mounts a few pages around now, not the whole chart. */
  pageBars: number;
  countInBars: number;
  /** Sticking letters (R / L / K) on notes that aren't judged yet. */
  hints: boolean;
};

/** Mockup numbers (docs/mockups/ipad/lesson-take.html): 62 px per eighth, now line a third in, 132 px label column. */
export const LEFTWARD_DEFAULTS: HighwayOptions = {
  flow: 'leftward', laneOrder: NOTATION_LANES, lanes: 'chart', pxPerBeat: 124, pastFraction: 1 / 3,
  gutter: 132, countRow: 56, headRoom: 28, pageBars: 4, countInBars: 1, hints: true,
};
/** Web numbers (src/play/Highway.tsx): 0.32 px per ms at 500 ms per beat = 160 px per beat, hit line 64 px up. */
export const DOWNWARD_DEFAULTS: HighwayOptions = {
  flow: 'downward', laneOrder: KIT_LANES, lanes: 'all', pxPerBeat: 160, pastFraction: 0.06,
  gutter: 64, countRow: 0, headRoom: 0, pageBars: 4, countInBars: 1, hints: false,
};

export const highwayDefaults = (flow: Flow): HighwayOptions => (flow === 'downward' ? DOWNWARD_DEFAULTS : LEFTWARD_DEFAULTS);

/** The lanes to draw, in the configured order. Never empty (a chart with no notes still shows a snare lane). */
export function lanesFor(notes: readonly ChartNoteLike[], o: Pick<HighwayOptions, 'laneOrder' | 'lanes'>): DrumId[] {
  let shown: DrumId[];
  if (o.lanes === 'all') shown = [...o.laneOrder];
  else if (o.lanes === 'chart') {
    const used = new Set(notes.map(n => laneOf(n.drum)));
    shown = o.laneOrder.filter(l => used.has(l));
  } else {
    const want = new Set(o.lanes);
    shown = o.laneOrder.filter(l => want.has(l));
  }
  return shown.length ? shown : ['snare'];
}

export type Rect = { x: number; y: number; w: number; h: number };
export type LaneBox = { id: DrumId; cross: number; size: number };

export type HighwayLayout = {
  flow: Flow;
  width: number;
  height: number;
  /** The scrolling area in view coordinates. Lanes, grid and notes use track coordinates. */
  track: Rect;
  /** The now line along the main axis (track coordinates). */
  nowAt: number;
  /** Track length along the main axis. */
  trackLength: number;
  lanes: LaneBox[];
  /** Lane-name boxes in view coordinates. */
  labels: (Rect & { id: DrumId })[];
  /** leftward: the count row's centre and height in track coordinates. */
  count?: { cross: number; size: number };
  /** Where the grid's "BAR n" labels sit across the main axis (track coordinates). */
  gridLabelCross: number;
  /** Lines span this range across the main axis (track coordinates). */
  linesFrom: number;
  linesTo: number;
  noteSize: number;
  pxPerBeat: number;
  /** +1: later beats further along the main axis (leftward); −1: later beats further up (downward). */
  sign: 1 | -1;
  /** Beats visible behind and ahead of the now line. */
  pastBeats: number;
  futureBeats: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function highwayLayout(width: number, height: number, lanes: readonly DrumId[], o: HighwayOptions): HighwayLayout {
  const w = Math.max(1, width), h = Math.max(1, height), n = Math.max(1, lanes.length), px = Math.max(1, o.pxPerBeat);
  if (o.flow === 'leftward') {
    const track: Rect = { x: o.gutter, y: 0, w: Math.max(1, w - o.gutter), h };
    const top = o.headRoom, bottom = h - o.countRow, laneH = Math.max(1, (bottom - top) / n);
    const laneBoxes = lanes.map((id, i) => ({ id, cross: top + laneH * (i + 0.5), size: laneH }));
    const nowAt = track.w * clamp(o.pastFraction, 0, 1);
    return {
      flow: 'leftward', width: w, height: h, track, nowAt, trackLength: track.w, lanes: laneBoxes,
      labels: laneBoxes.map(l => ({ id: l.id, x: 0, y: l.cross - laneH / 2, w: o.gutter, h: laneH })),
      count: o.countRow > 0 ? { cross: h - o.countRow / 2, size: o.countRow } : undefined,
      gridLabelCross: top / 2, linesFrom: Math.max(0, top - 4), linesTo: bottom,
      noteSize: clamp(laneH * 0.6, 16, 44), pxPerBeat: px, sign: 1,
      pastBeats: nowAt / px, futureBeats: (track.w - nowAt) / px,
    };
  }
  const track: Rect = { x: 0, y: 0, w, h: Math.max(1, h - o.gutter) };
  const laneW = w / n;
  const laneBoxes = lanes.map((id, i) => ({ id, cross: laneW * (i + 0.5), size: laneW }));
  const nowAt = track.h * (1 - clamp(o.pastFraction, 0, 1));
  return {
    flow: 'downward', width: w, height: h, track, nowAt, trackLength: track.h, lanes: laneBoxes,
    labels: laneBoxes.map(l => ({ id: l.id, x: l.cross - laneW / 2, y: track.h, w: laneW, h: o.gutter })),
    gridLabelCross: 8, linesFrom: 0, linesTo: w,
    noteSize: clamp(laneW * 0.5, 16, 44), pxPerBeat: px, sign: -1,
    pastBeats: (track.h - nowAt) / px, futureBeats: nowAt / px,
  };
}

/** Content position of a beat along the main axis. */
export function mainOf(beat: number, pxPerBeat: number, sign: 1 | -1): number {
  'worklet';
  return sign * beat * pxPerBeat;
}

/** Content translation that puts beat `pos` on the now line. */
export function scrollFor(pos: number, nowAt: number, pxPerBeat: number, sign: 1 | -1): number {
  'worklet';
  return nowAt - sign * pos * pxPerBeat;
}

/** Position in beats (negative during the count-in) at Clock time `clockMs`; `zero` = Clock ms of heard beat 0. */
export function positionAt(clockMs: number, zero: number, beatMs: number): number {
  'worklet';
  return (clockMs - zero) / beatMs;
}

/** Beats of a Clock-time stroke after removing the input latency (where an extra stroke is drawn). */
export function beatOfStroke(at: number, latencyMs: number, zero: number, beatMs: number): number {
  return (at - latencyMs - zero) / beatMs;
}

export const msPerBeat = (bpm: number): number => 60000 / bpm;

/** The count-in number for a position (src/engine/run.ts countInNumber): 1 2 3 4 during the bar before beat 0. */
export function countInNumber(pos: number, bpb: number): number {
  'worklet';
  return (((Math.floor(pos) % bpb) + bpb) % bpb) + 1;
}

/** 1 on the beat, fading to 0 a quarter of a beat later: the beat ball on the now line. */
export function beatPulse(pos: number): number {
  'worklet';
  const frac = pos - Math.floor(pos);
  return Math.max(0, 1 - frac * 4);
}

/** Opacity of a flash `age` ms after it started (0 before it and after `durMs`). */
export function flashOpacity(age: number, durMs: number): number {
  'worklet';
  if (age < 0 || age > durMs) return 0;
  return 1 - age / durMs;
}

// ---------- pages ----------

export type PageSpan = { pageBeats: number; minPage: number; maxPage: number; totalBeats: number; countInBeats: number; bpb: number };

export function pageSpan(chart: Pick<ChartLike, 'bars' | 'timeSignature'>, o: Pick<HighwayOptions, 'pageBars' | 'countInBars'>): PageSpan {
  const bpb = beatsPerBar(chart), pageBeats = Math.max(1, o.pageBars) * bpb, totalBeats = chart.bars * bpb;
  const countInBeats = Math.max(0, o.countInBars) * bpb;
  return {
    pageBeats, totalBeats, countInBeats, bpb,
    minPage: countInBeats > 0 ? Math.floor(-countInBeats / pageBeats) : 0,
    maxPage: Math.max(0, Math.ceil(totalBeats / pageBeats) - 1),
  };
}

/** First and last page to mount around `pos` (one beat of margin each side), clamped to the chart. */
export function visiblePages(pos: number, pastBeats: number, futureBeats: number, span: PageSpan): [number, number] {
  'worklet';
  const first = Math.floor((pos - pastBeats - 1) / span.pageBeats);
  const last = Math.floor((pos + futureBeats + 1) / span.pageBeats);
  const lo = Math.min(span.maxPage, Math.max(span.minPage, first));
  const hi = Math.max(lo, Math.min(span.maxPage, Math.max(span.minPage, last)));
  return [lo, hi];
}

// ---------- page content ----------

export type GridLine = { beat: number; main: number; kind: 'bar' | 'beat'; label?: string };
export type CountLabel = { beat: number; main: number; text: string; and: boolean; countIn: boolean };
export type NoteShape = 'circle' | 'square' | 'ring' | 'bar';
export type NoteGlyph = {
  index: number; lane: DrumId; beat: number; main: number; cross: number;
  shape: NoteShape; size: number; color: string; label: string;
  accent: boolean; ghost: boolean; auto: boolean; grace: number;
};
export type PageScene = { page: number; grid: GridLine[]; counts: CountLabel[]; notes: NoteGlyph[] };

const EPS = 1e-6;
const isWhole = (x: number) => Math.abs(x - Math.round(x)) < EPS;

/** How a note is drawn: kick as a rounded square, open hi-hat as a ring, the hi-hat foot as a short bar. */
export function noteShape(n: ChartNoteLike): NoteShape {
  if (n.drum === 'kick') return 'square';
  if (n.drum === 'hhOpen') return 'ring';
  if (n.drum === 'hhPedal') return 'bar';
  return 'circle';
}

/** The letter on a note before it's played: its sticking when the chart has one, K for the kick. */
export function noteLabel(n: ChartNoteLike): string {
  if (n.stick) return n.stick;
  if (n.drum === 'kick') return 'K';
  return '';
}

export function buildPage(
  page: number,
  chart: Pick<ChartLike, 'notes' | 'bars' | 'timeSignature'>,
  layout: Pick<HighwayLayout, 'lanes' | 'pxPerBeat' | 'sign' | 'noteSize' | 'count'>,
  span: PageSpan,
  theme: Pick<PlayTheme, 'drum'>,
  o: Pick<HighwayOptions, 'hints'>,
): PageScene {
  const from = Math.max(page * span.pageBeats, -span.countInBeats);
  const to = Math.min((page + 1) * span.pageBeats, span.totalBeats);
  const last = page === span.maxPage; // the final bar line belongs to the last page
  const inPage = (b: number) => b >= from - EPS && (b < to - EPS || (last && b <= to + EPS));
  const main = (b: number) => mainOf(b, layout.pxPerBeat, layout.sign);
  const { bpb } = span;

  const grid: GridLine[] = [];
  const bars = new Set<number>();
  for (let k = Math.ceil((from - EPS) / bpb); k * bpb <= to + EPS; k++) {
    const b = k * bpb + 0; // + 0 turns −0 into 0
    if (!inPage(b)) continue;
    bars.add(Math.round(b * 1000));
    const label = b < -EPS ? (Math.abs(b + span.countInBeats) < EPS ? 'COUNT-IN' : undefined) : b < span.totalBeats - EPS ? `BAR ${k + 1}` : undefined;
    grid.push({ beat: b, main: main(b), kind: 'bar', label });
  }
  for (let b = Math.ceil(from - EPS) + 0; b <= to + EPS; b++) {
    if (!inPage(b) || bars.has(Math.round(b * 1000))) continue;
    grid.push({ beat: b, main: main(b), kind: 'beat' });
  }
  grid.sort((a, b) => a.beat - b.beat);

  const counts: CountLabel[] = [];
  if (layout.count) {
    for (let h = Math.ceil((from - EPS) * 2); h / 2 < to - EPS; h++) {
      const b = h / 2;
      if (!inPage(b) || b >= span.totalBeats - EPS) continue;
      const countIn = b < 0, and = !isWhole(b);
      if (countIn && and) continue;
      const inBar = ((Math.floor(b + EPS) % bpb) + bpb) % bpb;
      counts.push({ beat: b, main: main(b), text: and ? '&' : String(Math.floor(inBar) + 1), and, countIn });
    }
  }

  const laneAt = new Map(layout.lanes.map(l => [l.id, l]));
  const notes: NoteGlyph[] = [];
  chart.notes.forEach((n, index) => {
    if (!inPage(n.t) || n.t >= span.totalBeats - EPS) return;
    const lane = laneOf(n.drum), box = laneAt.get(lane);
    if (!box) return;
    const shape = noteShape(n);
    const size = layout.noteSize * (n.ghost ? 0.65 : 1) * (shape === 'bar' ? 0.8 : 1);
    notes.push({
      index, lane, beat: n.t, main: main(n.t), cross: box.cross, shape, size, color: theme.drum[lane],
      label: o.hints ? noteLabel(n) : '', accent: !!n.accent, ghost: !!n.ghost, auto: !!n.auto, grace: n.grace ?? 0,
    });
  });
  return { page, grid, counts, notes };
}

/** Where a judged note or an extra stroke is marked (content coordinates), or null when its lane isn't shown. */
export function markerPlace(
  beat: number, lane: DrumId,
  layout: Pick<HighwayLayout, 'lanes' | 'pxPerBeat' | 'sign' | 'noteSize'>,
): { main: number; cross: number; size: number } | null {
  const box = layout.lanes.find(l => l.id === lane);
  if (!box) return null;
  return { main: mainOf(beat, layout.pxPerBeat, layout.sign), cross: box.cross, size: layout.noteSize };
}

/** Ring-buffer slot for the n-th marker: the oldest marker (furthest behind the now line) is reused first. */
export const markerSlot = (n: number, poolSize: number): number => ((n % poolSize) + poolSize) % poolSize;
