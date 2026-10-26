import { beatsPerBar, type Chart } from './chart.ts';
import type { Lesson, Step } from './lesson.ts';
import type { Run } from './run.ts';

// The backing band (R1): a synth bass and keys under grooves and songs, so the student learns to lock with a band.
// Pure: what to play and when, in beats of the run. Sound and scheduling live in the player (not wired yet).

export type BandStyle = 'rock' | 'funk' | 'shuffle' | 'swing' | 'sixeight' | 'odd';
/** `chords`: one chord symbol per bar, space-separated, wrapping (a 12-bar blues repeats). `fillBars`: 0-based run bars. */
export type BandSpec = { style: BandStyle; chords?: string; fillBars?: number[] };
export type BandNote = { t: number; dur: number; part: 'bass' | 'keys'; midi: number[]; vel: number };

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITY: Record<string, number[]> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6] };
/** A chord symbol (C, Am, E7, Bbmaj7, F#m7, Bdim) as keys notes in root position from middle C up, root first. */
export function chordMidi(sym: string): number[] {
  const m = /^([A-G])([#b]?)(maj7|m7|m|7|dim)?$/.exec(sym.trim());
  if (!m) throw new Error(`Unknown chord "${sym}"`);
  const root = 60 + ((PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12);
  return QUALITY[m[3] ?? ''].map(i => root + i);
}
/** The chord's root in the bass, between E2 (40) and D#3 (51). */
const bassRoot = (sym: string) => 40 + ((chordMidi(sym)[0] - 64 + 24) % 12);

/** Bass and keys for a run: the bass follows the kick (boogie for a shuffle, a walking line for swing), keys by style. */
export function bandNotes(spec: BandSpec, run: Run): BandNote[] {
  const bpb = run.beatsPerBar, bars = Math.ceil(run.beats / bpb - 1e-9);
  const chords = (spec.chords ?? 'C').trim().split(/\s+/);
  const chordOf = (bar: number) => chords[bar % chords.length];
  const out: BandNote[] = [];
  const add = (t: number, dur: number, part: BandNote['part'], midi: number[], vel: number) => {
    const d = Math.min(dur, run.beats - t);
    if (t < run.beats - 1e-9 && d > 1e-9) out.push({ t, dur: d, part, midi, vel });
  };
  for (let bar = 0; bar < bars; bar++) {
    const start = bar * bpb, end = start + bpb, sym = chordOf(bar), root = bassRoot(sym), keys = chordMidi(sym);
    if (spec.fillBars?.includes(bar)) { add(start, 1, 'bass', [root], 100); add(start, 1, 'keys', keys, 80); continue; } // one hit, then the fill is yours
    // Bass
    if (spec.style === 'swing') {
      const next = bassRoot(chordOf(bar + 1)), line = [root, root + 4, root + 7];
      for (let b = 0; b < bpb; b++) add(start + b, 1, 'bass', [b === bpb - 1 ? next - 1 : line[b % 3]], 85); // beat 4 leads into the next root
    } else if (spec.style === 'shuffle') {
      const boogie = [0, 4, 7, 9];
      for (let b = 0; b < bpb; b++) add(start + b, 2 / 3, 'bass', [root + boogie[b % 4]], 90);
    } else {
      const kicks = run.notes.filter(n => n.drum === 'kick' && n.t >= start - 1e-9 && n.t < end - 1e-9).map(n => n.t);
      const at = kicks.length ? [...new Set(kicks)] : [start];
      at.forEach((t, i) => add(t, (at[i + 1] ?? end) - t, 'bass', [root], 95));
    }
    // Keys
    const hits: [number, number][] = // [beat in bar, length]
      spec.style === 'rock' ? Array.from({ length: Math.ceil(bpb / 2) }, (_, i) => [2 * i, Math.min(2, bpb - 2 * i)])
      : spec.style === 'funk' ? Array.from({ length: Math.floor(bpb) }, (_, i) => [i + 0.5, 0.25])
      : spec.style === 'shuffle' ? Array.from({ length: Math.floor(bpb / 2) }, (_, i) => [2 * i + 1, 0.5])
      : spec.style === 'swing' ? [[0, 0.5], [1.5, 0.5]]
      : spec.style === 'sixeight' ? [[0, bpb / 2], [bpb / 2, bpb / 2]]
      : [[0, bpb]];
    for (const [b, len] of hits) add(start + b, len, 'keys', keys, spec.style === 'funk' ? 75 : 60);
  }
  return out.sort((a, b) => a.t - b.t || (a.part === 'bass' ? -1 : 1));
}

/** A band style guessed from a chart: 6/8, odd meters, a triplet grid (ride = swing, else shuffle), ghosts or 16th kicks = funk. */
export function bandStyle(chart: Pick<Chart, 'timeSignature' | 'notes'>): BandStyle {
  const [n, d] = chart.timeSignature, bpb = beatsPerBar(chart);
  if (n === 6 && d === 8) return 'sixeight';
  if (n % 2 === 1 && n > 3) return 'odd';
  const pos = (t: number) => t - Math.floor(t / bpb) * bpb;
  const on = (t: number, k: number) => Math.abs(pos(t) * k - Math.round(pos(t) * k)) < 1e-3;
  if (chart.notes.some(x => on(x.t, 3) && !on(x.t, 2))) return chart.notes.some(x => x.drum === 'ride') ? 'swing' : 'shuffle';
  if (chart.notes.some(x => x.ghost) || chart.notes.some(x => x.drum === 'kick' && on(x.t, 4) && !on(x.t, 2))) return 'funk';
  return 'rock';
}

/** A chord line per style when a lesson has none (one chord per bar, wrapping). */
export const DEFAULT_CHORDS: Record<BandStyle, string> = {
  rock: 'A A D E', funk: 'Em7 Em7 A7 A7', shuffle: 'A A A A D D A A E D A E', swing: 'C Am Dm G', sixeight: 'C Am F G', odd: 'D D G A',
};
/**
 * The band for a lesson step: on for grooves, songs and fills; off where the click is the point (counting, rudiments,
 * find-your-tempo, rests). Chords from the lesson, else the style's default line.
 */
export function bandFor(lesson: Pick<Lesson, 'kind' | 'band'>, step: Pick<Step, 'chart' | 'probe' | 'rest' | 'look'>): BandSpec | undefined {
  if (!['groove', 'song', 'fill'].includes(lesson.kind) || step.probe || step.rest || step.look) return undefined;
  const style = bandStyle(step.chart);
  return { style, chords: lesson.band?.chords ?? DEFAULT_CHORDS[style] };
}
