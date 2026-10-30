import { Midi } from '@tonejs/midi';
import { ChartSchema, beatsPerBar, type Chart, type ChartDrum, type ChartNote } from './chart.ts';

// General MIDI percussion → chart lanes. Anything else (cowbell, claps…) is counted and skipped.
export const GM_DRUMS: Record<number, ChartDrum> = {
  35: 'kick', 36: 'kick', 37: 'snare', 38: 'snare', 39: 'snare', 40: 'snare',
  42: 'hihat', 44: 'hhPedal', 46: 'hhOpen', 41: 'floor', 43: 'floor', 45: 'tom2', 47: 'tom2', 48: 'tom1', 50: 'tom1',
  49: 'crash', 52: 'crash', 55: 'crash', 57: 'crash', 51: 'ride', 53: 'ride', 59: 'ride',
};

export type ImportResult = { chart: Chart; ignored: number; drumTracks: number };

/**
 * Standard MIDI file → chart, using every track on channel 10 (or marked percussion).
 * shortcut: tempo changes are flattened — note times stay in sync with the audio, but the beat grid
 * follows the first tempo only. Fine for most pop/rock files; needs a tempo map for rubato songs.
 */
export function midiToChart(data: ArrayBuffer | Uint8Array, fallbackTitle = 'Imported song'): ImportResult {
  const midi = new Midi(data);
  const tracks = midi.tracks.filter(t => t.channel === 9 || t.instrument.percussion);
  if (!tracks.length) throw new Error('No drum track found (drums must be on MIDI channel 10).');
  const bpm = Math.round((midi.header.tempos[0]?.bpm ?? 120) * 100) / 100;
  const [num, den] = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4];
  const timeSignature: Chart['timeSignature'] = [2, 4, 8, 16].includes(den) && num >= 1 && num <= 16 ? [num, den as 4] : [4, 4];

  let ignored = 0;
  const seen = new Set<string>();
  const notes: ChartNote[] = [];
  for (const tr of tracks) {
    for (const n of tr.notes) {
      const drum = GM_DRUMS[n.midi];
      if (!drum) { ignored++; continue; }
      const t = Math.round(((n.time * bpm) / 60) * 96) / 96; // quantize to 1/96 beat so chords line up
      const key = `${t}:${drum}`;
      if (seen.has(key)) continue;
      seen.add(key);
      notes.push({ t, drum, ...(n.velocity >= 0.85 && { accent: true }), ...(n.velocity <= 0.35 && { ghost: true }) });
    }
  }
  if (!notes.length) throw new Error('The drum track has no notes this app understands.');
  notes.sort((a, b) => a.t - b.t);
  const bpb = beatsPerBar({ timeSignature });
  const chart = ChartSchema.parse({
    title: (midi.name || fallbackTitle).slice(0, 120), bpm: Math.min(300, Math.max(30, bpm)), timeSignature,
    bars: Math.floor(notes[notes.length - 1].t / bpb) + 1, kind: 'song', notes,
  });
  return { chart, ignored, drumTracks: tracks.length };
}
