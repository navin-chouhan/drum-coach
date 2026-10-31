// The core's chart and kit types as the play surfaces use them, plus the few play-only helpers built on them.
// Types and constants come from @drum-coach/core (packages/core/src/engine/{chart,kit}.ts); nothing is copied here.
import type { Chart, ChartDrum, ChartNote } from '@drum-coach/core/engine/chart';
import { PAD_INFO, PADS, type DrumId, type PadId } from '@drum-coach/core/engine/kit';

export { beatsPerBar, CHART_DRUMS } from '@drum-coach/core/engine/chart';
export { PADS } from '@drum-coach/core/engine/kit';
export type { ChartDrum, DrumId, PadId };

/** A chart note as the play surfaces read it (the core's ChartNote). */
export type ChartNoteLike = ChartNote;

/** The parts of the core's Chart the play surfaces read (a full Chart fits; so does a fixture without an id). */
export type ChartLike = Pick<Chart, 'bpm' | 'timeSignature' | 'bars'> & { title?: string; notes: readonly ChartNote[] };

/** Every drum the kit view draws (the core's DrumId as a list; `satisfies` keeps it complete). */
export const DRUM_IDS = ['kick', 'snare', 'hihat', 'tom1', 'tom2', 'floor', 'crash', 'ride'] as const satisfies readonly DrumId[];
type MissingDrum = Exclude<DrumId, (typeof DRUM_IDS)[number]>;
const allDrums: MissingDrum extends never ? true : never = true;
void allDrums;

/** The drum (lane) a pad belongs to (the core's PAD_INFO[pad].drum). */
export const PAD_DRUM = Object.fromEntries(PADS.map(p => [p, PAD_INFO[p].drum])) as Record<PadId, DrumId>;

/** The drum (lane) a chart note is drawn in: the hi-hat's three articulations share one lane. */
export function laneOf(drum: ChartDrum): DrumId {
  'worklet';
  return drum === 'hhOpen' || drum === 'hhPedal' ? 'hihat' : drum;
}

/** Lane names, as the web kit names its drums (core content/drums.ts, the web's src/ui/drums.ts). */
export { DRUM_NAME } from '@drum-coach/core/content/drums';
