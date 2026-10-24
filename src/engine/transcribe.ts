import type { ChartDrum, ChartNote } from './chart.ts';
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
