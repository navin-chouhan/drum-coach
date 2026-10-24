import { beatsPerBar, type Chart, type ChartNote } from './chart.ts';

export type RunOptions = { fromBar: number; toBar: number; repeats: number }; // bars are 1-based, inclusive
export type RunNote = ChartNote & { i: number; bar: number; pos: number }; // pos = beats into its bar
export type Run = { notes: RunNote[]; beats: number; beatsPerBar: number };

/** Expands the A–B section `repeats` times into one flat list; t is beats from the run start. */
export function buildRun(chart: Chart, o: RunOptions): Run {
  const bpb = beatsPerBar(chart);
  const from = Math.max(1, Math.min(o.fromBar, chart.bars));
  const to = Math.max(from, Math.min(o.toBar, chart.bars));
  const start = (from - 1) * bpb, len = (to - from + 1) * bpb;
  const section = chart.notes.filter(n => n.t >= start - 1e-6 && n.t < start + len - 1e-6).sort((a, b) => a.t - b.t);
  const notes: RunNote[] = [];
  for (let r = 0; r < Math.max(1, o.repeats); r++) {
    for (const n of section) {
      const t = n.t - start + r * len;
      notes.push({ ...n, t, i: notes.length, bar: Math.floor(t / bpb + 1e-6), pos: t - Math.floor(t / bpb + 1e-6) * bpb });
    }
  }
  return { notes, beats: len * Math.max(1, o.repeats), beatsPerBar: bpb };
}

export const beatMs = (bpm: number, speed = 1) => 60000 / (bpm * speed);
