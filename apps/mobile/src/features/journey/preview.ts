// The one-bar groove preview on Journey's lesson panel ("One bar · you play all three · new: snare"): the step's first
// bar as lanes of notes on the count grid, which limbs you play, and which one is new. Pure.
import { beatsPerBar, type ChartDrum } from '@drum-coach/core/engine/chart';
import type { DrumId } from '@drum-coach/core/engine/kit';
import { lanesNow, type LessonProgress, type Step } from '@drum-coach/core/engine/lesson';

export type PreviewLane = {
  drum: DrumId;
  label: string;
  /** Grid slots (0-based) with a note in this lane. */
  slots: number[];
  /** You play this lane (else the app does: drawn faded). */
  yours: boolean;
  /** New in this step: the lane is highlighted. */
  isNew: boolean;
};

export type GroovePreview = {
  lanes: PreviewLane[];
  /** Count under each slot: "1 & 2 & …" ('&', 'e', 'a' are drawn in blue). */
  count: string[];
  caption: string;
  /** "new: snare", or null. */
  newLabel: string | null;
};

const ORDER: DrumId[] = ['crash', 'ride', 'hihat', 'tom1', 'tom2', 'snare', 'floor', 'kick']; // as notation stacks them
const NAME: Record<DrumId, string> = { crash: 'Crash', ride: 'Ride', hihat: 'Hi-hat', tom1: 'Tom 1', tom2: 'Tom 2', snare: 'Snare', floor: 'Floor', kick: 'Kick' };
const WORD: Record<DrumId, string> = { crash: 'crash', ride: 'ride', hihat: 'hi-hat', tom1: 'tom 1', tom2: 'tom 2', snare: 'snare', floor: 'floor tom', kick: 'kick' };
const laneOf = (d: ChartDrum): DrumId => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d);
const near = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;

/** Slots per beat that hold every note of the bar (1, 2, 3 or 4; finer grids are drawn at 4). */
export function slotsPerBeat(times: number[]): 1 | 2 | 3 | 4 {
  for (const spb of [1, 2, 3, 4] as const) if (times.every(t => near(t * spb))) return spb;
  return 4;
}

export function countWords(beats: number, spb: number): string[] {
  const sub = { 1: [], 2: ['&'], 3: ['&', 'a'], 4: ['e', '&', 'a'] }[spb] ?? [];
  return Array.from({ length: beats }, (_, b) => [String(b + 1), ...sub]).flat();
}

const listWords = (ws: string[]) => (ws.length <= 1 ? ws.join('') : `${ws.slice(0, -1).join(', ')} and ${ws[ws.length - 1]}`);

/** The preview of `step` at the student's place in it (`progress.layer` for one-limb-at-a-time steps). */
export function groovePreview(step: Step, progress?: LessonProgress, prev?: Step): GroovePreview | null {
  if (step.rest || step.look || step.quiz || step.transcribe || step.listen) return null;
  const bpb = beatsPerBar(step.chart);
  const notes = step.chart.notes.filter(n => n.t < bpb - 1e-6);
  if (!notes.length) return null;
  const spb = slotsPerBeat(notes.map(n => n.t));
  const p = progress ?? { step: 0, bpm: 0, clean: 0, fails: 0, bestBpm: 0, reviewStage: 0 };
  const active = lanesNow(step, p);
  const mine = new Set((active ?? notes.map(n => n.drum)).map(laneOf));
  // What's new: lanes you play now that you didn't one layer (or one step) ago.
  const layer = p.layer ?? 0;
  const before = step.layers?.length ? (layer > 0 ? step.layers[layer - 1] : undefined) : prev ? (prev.activeLanes ?? prev.chart.notes.map(n => n.drum)) : undefined;
  const had = before ? new Set(before.map(laneOf)) : null;
  const drums = ORDER.filter(d => notes.some(n => laneOf(n.drum) === d));
  const lanes = drums.map(drum => ({
    drum, label: NAME[drum], yours: mine.has(drum), isNew: !!had && mine.has(drum) && !had.has(drum),
    slots: [...new Set(notes.filter(n => laneOf(n.drum) === drum).map(n => Math.min(bpb * spb - 1, Math.round(n.t * spb))))].sort((a, b) => a - b),
  }));
  const yours = lanes.filter(l => l.yours);
  const all = yours.length === lanes.length;
  const caption = all
    ? `you play ${lanes.length === 1 ? 'it' : lanes.length === 2 ? 'both' : lanes.length === 3 ? 'all three' : 'them all'}`
    : `you play the ${listWords(yours.map(l => WORD[l.drum]))}`;
  const fresh = lanes.filter(l => l.isNew).map(l => WORD[l.drum]);
  return { lanes, count: countWords(Math.round(bpb), spb), caption: `One bar · ${caption}`, newLabel: fresh.length ? `new: ${listWords(fresh)}` : null };
}
