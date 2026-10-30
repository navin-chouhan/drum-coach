// What a judged note or an extra stroke looks like on the highway (iPad mockups: green ✓ on it, orange ‹ › early/late
// with the offset under it, red dashed outline with ✕ missed, red ✕ extra). Pure TypeScript (Vitest-tested).
import type { ChartNoteLike, DrumId } from './chartLike';
import { offsetLabel, resultKind, type PlayResult } from './events';
import { beatOfStroke, markerPlace, noteShape, type HighwayLayout } from './geometry';
import type { PlayTheme, ResultKind } from './theme';

export type MarkerGlyph = {
  key: string;
  kind: ResultKind;
  lane: DrumId;
  beat: number;
  main: number;
  cross: number;
  width: number;
  height: number;
  radius: number;
  fill: string;
  border: string;
  dashed: boolean;
  glyph: string;
  glyphColor: string;
  /** "+48 ms" under early/late notes. */
  caption: string;
};

const GLYPH: Record<ResultKind, string> = { onIt: '✓', early: '‹', late: '›', missed: '✕', extra: '✕' };

export type MarkerContext = {
  notes: readonly ChartNoteLike[];
  layout: Pick<HighwayLayout, 'lanes' | 'pxPerBeat' | 'sign' | 'noteSize'>;
  theme: PlayTheme;
  zero: number;
  beatMs: number;
  latencyMs: number;
};

/** The marker for a result, or null when it can't be placed (unknown note, lane not shown). */
export function markerFor(r: PlayResult, ctx: MarkerContext, seq: number): MarkerGlyph | null {
  const kind = resultKind(r);
  let beat: number, square = false, lane = r.lane;
  if (r.kind === 'judged') {
    const note = ctx.notes[r.index];
    if (!note) return null;
    beat = note.t;
    square = noteShape(note) === 'square';
  } else {
    beat = beatOfStroke(r.at, ctx.latencyMs, ctx.zero, ctx.beatMs);
    if (!Number.isFinite(beat)) return null;
    lane = r.lane;
  }
  const place = markerPlace(beat, lane, ctx.layout);
  if (!place) return null;
  const size = place.size, width = square ? size * 1.3 : size;
  const color = ctx.theme.result[kind];
  const hollow = kind === 'missed' || kind === 'extra';
  return {
    key: r.kind === 'judged' ? `n${r.index}` : `x${seq}`,
    kind, lane, beat, main: place.main, cross: place.cross,
    width, height: size, radius: square ? size * 0.26 : size / 2,
    fill: kind === 'missed' ? ctx.theme.background : hollow ? 'transparent' : color, // a missed marker covers its note
    border: kind === 'missed' ? color : 'transparent',
    dashed: kind === 'missed',
    glyph: GLYPH[kind],
    glyphColor: hollow ? color : ctx.theme.noteText,
    caption: offsetLabel(kind, r.kind === 'judged' ? r.offsetMs : undefined),
  };
}

/** Adds a marker, replacing the same note's earlier one, keeping the newest `max`. */
export function addMarker(list: readonly MarkerGlyph[], m: MarkerGlyph, max = 64): MarkerGlyph[] {
  const next = list.filter(x => x.key !== m.key);
  next.push(m);
  return next.length > max ? next.slice(next.length - max) : next;
}
