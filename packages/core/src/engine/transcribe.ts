import { beatsPerBar, type Chart, type ChartDrum, type ChartNote } from './chart.ts';
import type { PadId } from './kit.ts';

export const PAD_DRUM: Record<PadId, ChartDrum> = {
  kick: 'kick', snare: 'snare', hhClosed: 'hihat', hhOpen: 'hhOpen', hhPedal: 'hhPedal',
  tom1: 'tom1', tom2: 'tom2', floor: 'floor', crash: 'crash', ride: 'ride',
};

/** Your hits (in song beats) → chart notes on the nearest step inside [fromBeat, toBeat). */
export function quantizeTake(hits: { beat: number; pad: PadId; velocity: number }[], fromBeat: number, toBeat: number, stepsPerBeat = 4): ChartNote[] {
  const seen = new Set<string>(), out: ChartNote[] = [];
  for (const h of hits) {
    const t = Math.round(h.beat * stepsPerBeat) / stepsPerBeat;
    if (t < fromBeat || t >= toBeat) continue;
    const drum = PAD_DRUM[h.pad], key = `${t}:${drum}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ t, drum, ...(h.velocity >= 110 && { accent: true }), ...(h.velocity <= 45 && { ghost: true }) });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Replaces the notes in [from, to) with `take`. */
export const replaceRange = (notes: ChartNote[], take: ChartNote[], from: number, to: number) =>
  [...notes.filter(n => n.t < from || n.t >= to), ...take].sort((a, b) => a.t - b.t);

/** Toggles one note (grid editor). */
export function toggleNote(notes: ChartNote[], t: number, drum: ChartDrum): ChartNote[] {
  const i = notes.findIndex(n => Math.abs(n.t - t) < 1e-6 && n.drum === drum);
  return i >= 0 ? notes.filter((_, j) => j !== i) : [...notes, { t, drum }].sort((a, b) => a.t - b.t);
}

/** Listen back: a take's hits as an unquantised chart (their real timing, extras included) to play as a demo. */
export function takeChart(hits: { time: number; pad?: PadId; velocity: number }[], take: { zero: number; beatMs: number; beats: number; beatsPerBar: number; title: string; timeSignature: [number, 2 | 4 | 8 | 16] }) {
  const notes: ChartNote[] = hits.map(h => ({ t: (h.time - take.zero) / take.beatMs, drum: PAD_DRUM[h.pad ?? 'snare'], ...(h.velocity >= 110 && { accent: true }), ...(h.velocity < 40 && { ghost: true }) }))
    .filter(n => n.t >= 0 && n.t < take.beats).sort((a, b) => a.t - b.t);
  return { title: take.title, bpm: 60000 / take.beatMs, timeSignature: take.timeSignature, bars: Math.ceil(take.beats / take.beatsPerBar), notes };
}

/** Song bite: bars fromBar–toBar (1-based, inclusive) of a song's notes, moved to start at beat 0. */
export const cutBars = (notes: ChartNote[], beatsPerBar: number, fromBar: number, toBar: number): ChartNote[] => {
  const a = (fromBar - 1) * beatsPerBar, b = toBar * beatsPerBar;
  return notes.filter(n => n.t >= a - 1e-6 && n.t < b - 1e-6).map(n => ({ ...n, t: n.t - a }));
};

/** The whole saved song as one chart (tempo from its original video's beat grid), to play it through on the app's drums. */
export function songChart(song: { title: string; originalId: string; timeSignature: [number, 2 | 4 | 8 | 16]; notes: ChartNote[]; grids: Record<string, { bpm: number }> }): Chart {
  const notes = song.notes.filter(n => n.t >= 0).sort((a, b) => a.t - b.t);
  const bpm = Math.round(song.grids[song.originalId]?.bpm ?? Object.values(song.grids)[0]?.bpm ?? 100);
  const bars = notes.length ? Math.floor(notes[notes.length - 1].t / beatsPerBar({ timeSignature: song.timeSignature }) + 1e-6) + 1 : 1;
  return { title: song.title, bpm, timeSignature: song.timeSignature, bars, notes, kind: 'song' };
}

/** Your fills: the hits of one bar of a take (0-based bar of the take), as 16th-note chart notes from 0 to beatsPerBar. */
export function fillFromTake(hits: { time: number; pad?: PadId; velocity: number }[], take: { zero: number; beatMs: number; beatsPerBar: number }, bar: number): ChartNote[] {
  const start = bar * take.beatsPerBar;
  const inBar = hits.flatMap(h => (h.pad ? [{ beat: (h.time - take.zero) / take.beatMs - start, pad: h.pad, velocity: h.velocity }] : []));
  return quantizeTake(inBar, 0, take.beatsPerBar);
}

/**
 * Transcription (N7): a written grid against the real chart. Notes match by drum (open or closed hi-hat alike) and
 * position to the nearest step; `pct` = right / (all of the chart's notes + wrong extra ones).
 */
export function gridScore(written: { t: number; drum: ChartNote['drum'] }[], answer: { t: number; drum: ChartNote['drum'] }[], stepsPerBeat: number) {
  const key = (n: { t: number; drum: string }) => `${Math.round(n.t * stepsPerBeat)}:${n.drum === 'hhOpen' ? 'hihat' : n.drum}`;
  const want = new Set(answer.map(key)), got = new Set(written.map(key));
  const right = [...got].filter(k => want.has(k)).length, extra = got.size - right, missed = want.size - right;
  return { right, extra, missed, pct: want.size ? Math.round((right / (want.size + extra)) * 100) : 0 };
}

/** The note grids' drum rows, top to bottom (the song grid editor, the transcription step). */
export const GRID_ROWS: ChartDrum[] = ['crash', 'ride', 'hihat', 'hhOpen', 'hhPedal', 'tom1', 'tom2', 'floor', 'snare', 'kick'];
/** The rows' short names. */
export const GRID_ROW_NAME: Record<ChartDrum, string> = { crash: 'Crash', ride: 'Ride', hihat: 'Hi-hat', hhOpen: 'HH open', hhPedal: 'HH foot', tom1: 'Tom 1', tom2: 'Tom 2', floor: 'Floor', snare: 'Snare', kick: 'Kick' };
/** A transcription passes at this many % (gridScore pct). */
export const TRANSCRIBE_PASS = 80;
/** Steps per beat for writing a chart on a grid: 8ths, 16ths or triplets, whichever fits every note (else 16ths). */
export const gridStepsOf = (c: Pick<Chart, 'notes'>) => [2, 4, 3].find(k => c.notes.every(n => Math.abs(n.t * k - Math.round(n.t * k)) < 1e-6)) ?? 4;
