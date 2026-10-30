// Local mirrors of the core's chart and kit types, so the play surfaces build before A1 moves the engine into
// packages/core. SWAP after A1 merges: import ChartDrum/ChartNote/Chart from '@drum-coach/core/engine/chart' and
// PadId/DrumId from '@drum-coach/core/engine/kit', then delete the copies here (chartLike.test.ts pins them to the web's).

/** Chart lanes (src/engine/chart.ts CHART_DRUMS). 'hihat' accepts open or closed; 'hhOpen' asks for open. */
export const CHART_DRUMS = ['kick', 'snare', 'hihat', 'hhOpen', 'hhPedal', 'tom1', 'tom2', 'floor', 'crash', 'ride'] as const;
export type ChartDrum = (typeof CHART_DRUMS)[number];

/** What the module can send (src/engine/kit.ts PADS). */
export const PADS = ['kick', 'snare', 'hhClosed', 'hhOpen', 'hhPedal', 'tom1', 'tom2', 'floor', 'crash', 'ride'] as const;
export type PadId = (typeof PADS)[number];

/** What the kit view draws: the hi-hat is one drum with three pads (src/engine/kit.ts DrumId). */
export const DRUM_IDS = ['kick', 'snare', 'hihat', 'tom1', 'tom2', 'floor', 'crash', 'ride'] as const;
export type DrumId = (typeof DRUM_IDS)[number];

/** The fields of src/engine/chart.ts ChartNote the play surfaces read. */
export type ChartNoteLike = {
  t: number; // quarter-note beats from the start
  drum: ChartDrum;
  accent?: boolean;
  ghost?: boolean;
  auto?: boolean; // played by the app, not the student
  grace?: 1 | 2 | 3;
  stick?: 'R' | 'L';
  buzz?: boolean;
};

/** The fields of src/engine/chart.ts Chart the play surfaces read. */
export type ChartLike = {
  title?: string;
  bpm: number;
  timeSignature: readonly [number, number];
  bars: number;
  notes: readonly ChartNoteLike[];
};

/** Quarter-note beats per bar (6/8 → 3), as src/engine/chart.ts beatsPerBar. */
export const beatsPerBar = (c: { timeSignature: readonly [number, number] }): number => (c.timeSignature[0] * 4) / c.timeSignature[1];

/** The drum (lane) a pad belongs to (src/engine/kit.ts PAD_INFO[pad].drum). */
export const PAD_DRUM: Record<PadId, DrumId> = {
  kick: 'kick', snare: 'snare', hhClosed: 'hihat', hhOpen: 'hihat', hhPedal: 'hihat',
  tom1: 'tom1', tom2: 'tom2', floor: 'floor', crash: 'crash', ride: 'ride',
};

/** The drum (lane) a chart note is drawn in: the hi-hat's three articulations share one lane. */
export function laneOf(drum: ChartDrum): DrumId {
  'worklet';
  return drum === 'hhOpen' || drum === 'hhPedal' ? 'hihat' : drum;
}

/** Short names (src/engine/kit.ts PAD_INFO / src/ui/drums.ts). */
export const DRUM_NAME: Record<DrumId, string> = {
  kick: 'Kick', snare: 'Snare', hihat: 'Hi-hat', tom1: 'Tom 1', tom2: 'Tom 2', floor: 'Floor tom', crash: 'Crash', ride: 'Ride',
};
