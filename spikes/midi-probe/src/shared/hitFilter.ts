// Copied from src/input/hits.ts (emitNote's bounce and crosstalk filters) and src/engine/padCal.ts (mapVelocity)
// for Gate 0; moves to @drum-coach/core in A1. Semantics unchanged. Store-free: the note map and pad calibration are
// passed in instead of read from src/input/store.ts (localStorage), and the filter state lives in the returned object
// instead of module globals.

import { padForNote, type NoteMap, type PadId } from './kit';

export type PadCalibration = { soft: number; loud: number; bounceMs?: number; bounceRatio?: number };
export type KitCalibration = Partial<Record<PadId, PadCalibration>>;
const SOFT = 30, LOUD = 120;

/** A pad's raw velocity on the common scale (its soft → 30, its loud → 120), clamped to 1–127. None: unchanged. */
export function mapVelocity(v: number, cal?: Pick<PadCalibration, 'soft' | 'loud'>): number {
  if (!cal || cal.loud - cal.soft < 10) return v;
  return Math.max(1, Math.min(127, Math.round(SOFT + ((v - cal.soft) / (cal.loud - cal.soft)) * (LOUD - SOFT))));
}

/** time is the one monotonic ms clock (on iOS: DrumMidi.nowMs() / hostTimeMs). */
export type Hit = { note: number; velocity: number; time: number; pad?: PadId };

/**
 * A stick bounce (or pad retrigger): same note again within this many ms at under BOUNCE_RATIO of its velocity.
 * Retriggers on the real kit came at 50–65 %; a weaker hand in fast singles plays ~80–90 %, a flam's main note louder: both stay.
 */
export const BOUNCE_MS = 60, BOUNCE_RATIO = 0.7;

/**
 * Crosstalk on the MPS-150: a soft snare stroke (a ghost, velocity ≤ CROSSTALK_SNARE_MAX) can also fire the hi-hat
 * ~10 ms later, no louder than the snare. Real hi-hat strokes in ghost-note grooves are far louder, and a backbeat
 * never causes it, so only that soft echo is dropped.
 */
export const CROSSTALK_MS = 15, CROSSTALK_SNARE_MAX = 44;

export type HitFilter = {
  /** One Note On (velocity > 0): the hit, or null when it is a bounce or crosstalk. */
  push(note: number, velocity: number, time: number): Hit | null;
  reset(): void;
};

export function createHitFilter(noteMap: () => NoteMap, padCal: () => KitCalibration = () => ({})): HitFilter {
  const last = new Map<number, { time: number; velocity: number }>();
  let lastSnare = { time: -Infinity, velocity: 0 };
  return {
    push(note, velocity, time) {
      const prev = last.get(note);
      const pad = padForNote(noteMap(), note), cal = pad ? padCal()[pad] : undefined; // N9: the pad's own retrigger window and loudness
      // a dropped bounce isn't remembered: later retriggers are compared with the real stroke (a flam's grace retrigger let the main's through)
      if (prev && time - prev.time >= 0 && time - prev.time < (cal?.bounceMs ?? BOUNCE_MS) && velocity < prev.velocity * (cal?.bounceRatio ?? BOUNCE_RATIO)) return null;
      last.set(note, { time, velocity });
      if (pad === 'snare') lastSnare = { time, velocity };
      else if ((pad === 'hhClosed' || pad === 'hhOpen') && time - lastSnare.time >= 0 && time - lastSnare.time < CROSSTALK_MS
        && lastSnare.velocity <= CROSSTALK_SNARE_MAX && velocity <= lastSnare.velocity) return null;
      return { note, velocity: mapVelocity(velocity, cal), time, pad }; // raw velocities above (filters), the common scale from here
    },
    reset() {
      last.clear();
      lastSnare = { time: -Infinity, velocity: 0 };
    },
  };
}
