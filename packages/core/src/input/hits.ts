import { padForNote, type NoteMap, type PadId } from '../engine/kit.ts';
import { parseMidiMessage } from '../engine/midi.ts';
import { mapVelocity, type KitCalibration } from '../engine/padCal.ts';

/** time is host milliseconds on the app's one Clock (web: performance.now(), the same clock as MIDIMessageEvent.timeStamp). */
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

/** What the hit path needs from the app: its Clock, and the current kit's note map and pad calibration (read per hit). */
export type HitBusDeps = { now: () => number; getNoteMap: () => NoteMap; getPadCal: () => KitCalibration };

// Plain functions (no `this`), so an app can export them one by one from its singleton.
export type HitBus = {
  /** Raw MIDI bytes from the kit (or the emulated kit) at `time`: only Note On becomes a hit. */
  receiveMidi: (data: ArrayLike<number>, time: number) => void;
  /** One note through the bounce and crosstalk filters; `time` defaults to deps.now(). */
  emitNote: (note: number, velocity: number, time?: number) => void;
  /** Simulates the kit: sends whatever note the pad is mapped to, so it goes through the same path. */
  emitPad: (pad: PadId, velocity: number, time?: number) => void;
  onHit: (fn: (h: Hit) => void) => () => void;
  /** Every raw MIDI message as it arrives (dev: recording real-kit fixtures, N11). */
  onRawMidi: (fn: (data: ArrayLike<number>, time: number) => void) => () => void;
  /** Forgets the bounce and crosstalk memory (the last stroke per note, the last snare). */
  reset: () => void;
};

/** The input path: raw MIDI → note map → bounce and crosstalk filters → per-pad velocity → hit listeners. */
export function createHitBus(deps: HitBusDeps): HitBus {
  const { now, getNoteMap, getPadCal } = deps;
  const listeners = new Set<(h: Hit) => void>();
  const rawListeners = new Set<(data: ArrayLike<number>, time: number) => void>();
  const last = new Map<number, { time: number; velocity: number }>();
  let lastSnare = { time: -Infinity, velocity: 0 };

  function onHit(fn: (h: Hit) => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }

  function emitNote(note: number, velocity: number, time = now()) {
    const prev = last.get(note);
    const pad = padForNote(getNoteMap(), note), cal = pad ? getPadCal()[pad] : undefined; // N9: the pad's own retrigger window and loudness
    // a dropped bounce isn't remembered: later retriggers are compared with the real stroke (a flam's grace retrigger let the main's through)
    if (prev && time - prev.time >= 0 && time - prev.time < (cal?.bounceMs ?? BOUNCE_MS) && velocity < prev.velocity * (cal?.bounceRatio ?? BOUNCE_RATIO)) return;
    last.set(note, { time, velocity });
    if (pad === 'snare') lastSnare = { time, velocity };
    else if ((pad === 'hhClosed' || pad === 'hhOpen') && time - lastSnare.time >= 0 && time - lastSnare.time < CROSSTALK_MS
      && lastSnare.velocity <= CROSSTALK_SNARE_MAX && velocity <= lastSnare.velocity) return;
    const hit: Hit = { note, velocity: mapVelocity(velocity, cal), time, pad }; // raw velocities above (filters), the common scale from here
    listeners.forEach(l => l(hit));
  }

  function onRawMidi(fn: (data: ArrayLike<number>, time: number) => void) {
    rawListeners.add(fn);
    return () => { rawListeners.delete(fn); };
  }

  function receiveMidi(data: ArrayLike<number>, time: number) {
    rawListeners.forEach(l => l(data, time));
    const n = parseMidiMessage(data);
    if (n) emitNote(n.note, n.velocity, time);
  }

  const emitPad = (pad: PadId, velocity: number, time?: number) => emitNote(getNoteMap()[pad], velocity, time);

  function reset() {
    last.clear();
    lastSnare = { time: -Infinity, velocity: 0 };
  }

  return { receiveMidi, emitNote, emitPad, onHit, onRawMidi, reset };
}
