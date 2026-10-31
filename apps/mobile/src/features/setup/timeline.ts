// Kit test's hit timeline (the web's src/ui/Timeline.tsx, from the prototype): the last 4 seconds, one lane per drum,
// each hit a dot that slides left from the "now" line, bigger for louder, fading with age. Pure: the screen keeps the
// hits and draws the dots on the UI thread (TimelineView.tsx). The position functions are worklets.
import { PAD_INFO, type DrumId, type PadId } from '@drum-coach/core/engine/kit';

export const TIMELINE_WINDOW_MS = 4000;
export const TIMELINE_LABEL_W = 82;
/** The "now" line's distance from the right edge. */
export const TIMELINE_NOW_INSET = 14;
/** The web keeps 400; the screen shows at most this many (4 s of 16ths at 240 BPM on every lane is far fewer). */
export const TIMELINE_MAX = 64;

/** The web's LANE_ORDER, with its lane names (src/ui/drums.ts). */
export const TIMELINE_LANES: { id: DrumId; name: string }[] = [
  { id: 'crash', name: 'Crash' }, { id: 'ride', name: 'Ride' }, { id: 'hihat', name: 'Hi-hat' }, { id: 'tom1', name: 'Tom 1' },
  { id: 'tom2', name: 'Tom 2' }, { id: 'floor', name: 'Floor tom' }, { id: 'snare', name: 'Snare' }, { id: 'kick', name: 'Kick' },
];
export const TIMELINE_TITLE = 'Timeline · last 4 seconds';

export type TimelineHit = { key: number; lane: number; drum: DrumId; t: number; v: number };

/** Adds a hit (pads only; unmapped notes have no lane) and drops what's older than the window, keeping the newest. */
export function addTimelineHit(list: readonly TimelineHit[], hit: { pad?: PadId; time: number; velocity: number }, key: number): TimelineHit[] {
  if (!hit.pad) return list as TimelineHit[];
  const drum = PAD_INFO[hit.pad].drum;
  const lane = TIMELINE_LANES.findIndex(l => l.id === drum);
  const next = [...list.filter(h => hit.time - h.t <= TIMELINE_WINDOW_MS), { key, lane, drum, t: hit.time, v: hit.velocity / 127 }];
  return next.length > TIMELINE_MAX ? next.slice(next.length - TIMELINE_MAX) : next;
}

/** The dot's centre x for a hit `age` ms old, in a timeline `width` wide (the web's xOf). */
export function timelineX(age: number, width: number): number {
  'worklet';
  return width - TIMELINE_NOW_INSET - (age / TIMELINE_WINDOW_MS) * (width - TIMELINE_NOW_INSET - TIMELINE_LABEL_W);
}

/** The dot's radius and opacity: louder is bigger, a fresh hit pops for 220 ms, older ones fade (the web's draw). */
export function timelineDot(age: number, v: number): { r: number; opacity: number } {
  'worklet';
  const fresh = Math.max(0, 1 - age / 220);
  return { r: 3.5 + v * 6.5 + fresh * 5, opacity: age > TIMELINE_WINDOW_MS || age < 0 ? 0 : 0.35 + 0.65 * (1 - age / TIMELINE_WINDOW_MS) };
}
