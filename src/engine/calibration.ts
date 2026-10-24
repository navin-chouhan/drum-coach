import type { NoteMap, PadId } from './kit';

// Pedal before closed: pressing the pedal sends its own note, which the closed step must ignore.
export const CALIBRATION_ORDER: PadId[] = ['kick', 'snare', 'hhOpen', 'hhPedal', 'hhClosed', 'tom1', 'tom2', 'floor', 'crash', 'ride'];

/** Ignore hits this soon after a capture (double triggers, rebounds). */
export const DEBOUNCE_MS = 400;

export type CalState = {
  step: number;
  captured: Partial<NoteMap>;
  lastTime: number;
  conflict?: { note: number; pad: PadId };
};

export const initialCal = (): CalState => ({ step: 0, captured: {}, lastTime: -Infinity });

/** Feeds one hit into the wizard. A note already captured for another pad is a conflict and doesn't advance. */
export function calibrate(s: CalState, note: number, time: number): CalState {
  const pad = CALIBRATION_ORDER[s.step];
  if (!pad || time - s.lastTime < DEBOUNCE_MS) return s;
  if (pad === 'hhClosed' && note === s.captured.hhPedal) return s;
  const clash = (Object.keys(s.captured) as PadId[]).find(p => p !== pad && s.captured[p] === note);
  if (clash) return { ...s, lastTime: time, conflict: { note, pad: clash } };
  return { step: s.step + 1, captured: { ...s.captured, [pad]: note }, lastTime: time };
}

export const skip = (s: CalState): CalState => ({ ...s, step: Math.min(s.step + 1, CALIBRATION_ORDER.length), conflict: undefined });

export function back(s: CalState): CalState {
  const step = Math.max(0, s.step - 1);
  const captured = { ...s.captured };
  delete captured[CALIBRATION_ORDER[step]];
  return { ...s, step, captured, conflict: undefined };
}
