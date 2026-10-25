import { z } from 'zod';
import type { PadId } from './kit.ts';

// Chart lanes. 'hihat' accepts open or closed; 'hhOpen' asks for open specifically.
export const CHART_DRUMS = ['kick', 'snare', 'hihat', 'hhOpen', 'hhPedal', 'tom1', 'tom2', 'floor', 'crash', 'ride'] as const;
export type ChartDrum = (typeof CHART_DRUMS)[number];

export const ChartNoteSchema = z.object({
  t: z.number().min(0), // quarter-note beats from the start
  drum: z.enum(CHART_DRUMS),
  accent: z.boolean().optional(),
  ghost: z.boolean().optional(),
  auto: z.boolean().optional(), // played by the app, not the student (the "call" of a copy-me step)
});

export const ChartSchema = z.object({
  id: z.string().max(80).optional(),
  title: z.string().min(1).max(120),
  bpm: z.number().min(30).max(300), // quarter notes per minute
  timeSignature: z.tuple([z.number().int().min(1).max(16), z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)])]),
  bars: z.number().int().min(1).max(1000),
  level: z.number().int().min(0).max(10).optional(), // 0 = the curriculum's first level
  kind: z.enum(['groove', 'rudiment', 'fill', 'song', 'exercise']).optional(),
  description: z.string().max(500).optional(),
  notes: z.array(ChartNoteSchema).min(1).max(50_000),
}).refine(c => c.notes.every(n => n.t < c.bars * beatsPerBar(c)), { message: 'a note is past the last bar' });

export type ChartNote = z.infer<typeof ChartNoteSchema>;
export type Chart = z.infer<typeof ChartSchema>;

/** Quarter-note beats per bar (6/8 → 3). */
export const beatsPerBar = (c: { timeSignature: readonly [number, number] }): number => (c.timeSignature[0] * 4) / c.timeSignature[1];

export const DRUM_PAD: Record<ChartDrum, PadId[]> = {
  kick: ['kick'], snare: ['snare'], hihat: ['hhClosed', 'hhOpen'], hhOpen: ['hhOpen'], hhPedal: ['hhPedal'],
  tom1: ['tom1'], tom2: ['tom2'], floor: ['floor'], crash: ['crash'], ride: ['ride'],
};
export const padMatches = (drum: ChartDrum, pad: PadId) => DRUM_PAD[drum].includes(pad);

/**
 * Builds one bar-long pattern from text lines: one char per step, `stepsPerBeat` steps per beat.
 * x = hit, X = accent, g = ghost, anything else = rest. Then repeats it `bars` times.
 */
export function pattern(lines: Partial<Record<ChartDrum, string>>, stepsPerBeat: number, bars = 1, offsetBeats = 0): ChartNote[] {
  const notes: ChartNote[] = [];
  const barBeats = Math.max(...Object.values(lines).map(l => l!.length)) / stepsPerBeat;
  for (let b = 0; b < bars; b++) {
    for (const [drum, line] of Object.entries(lines) as [ChartDrum, string][]) {
      [...line].forEach((ch, i) => {
        if (!'xXg'.includes(ch)) return;
        notes.push({ t: offsetBeats + b * barBeats + i / stepsPerBeat, drum, ...(ch === 'X' && { accent: true }), ...(ch === 'g' && { ghost: true }) });
      });
    }
  }
  return notes.sort((a, b) => a.t - b.t);
}
