import type { ChartNote } from '../engine/chart';
import { getSettings, setSettings } from '../input/settings';
import { start } from './player';

// Your fills: one-bar fills you made up in free bars, kept to hear again (Trophies, fill lessons).
export type Fill = NonNullable<ReturnType<typeof getSettings>['fills']>[number];

export function keepFill(notes: ChartNote[], bpm: number, timeSignature: [number, 2 | 4 | 8 | 16]) {
  const fill = { id: `${Date.now()}`, at: new Date().toISOString(), bpm: Math.round(bpm), timeSignature, notes };
  setSettings({ fills: [...(getSettings().fills ?? []), fill].slice(-20) });
}

/** Plays a kept fill twice, with a bar of count-in. */
export function hearFill(f: Fill) {
  start({ title: 'Your fill', bpm: f.bpm, timeSignature: f.timeSignature ?? [4, 4], bars: 1, notes: f.notes }, // older fills: 4/4
    { fromBar: 1, toBar: 1, repeats: 2, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false, demo: true });
}
