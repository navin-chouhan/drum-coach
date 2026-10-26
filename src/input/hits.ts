import { padForNote, type PadId } from '../engine/kit';
import { parseMidiMessage } from '../engine/midi';
import { getNoteMap, getPadCal } from './store';
import { mapVelocity } from '../engine/padCal';

/** time is performance.now() milliseconds (same clock as MIDIMessageEvent.timeStamp). */
export type Hit = { note: number; velocity: number; time: number; pad?: PadId };

const listeners = new Set<(h: Hit) => void>();

export function onHit(fn: (h: Hit) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * A stick bounce (or pad retrigger): same note again within this many ms at under BOUNCE_RATIO of its velocity.
 * Retriggers on the real kit came at 50–65 %; a weaker hand in fast singles plays ~80–90 %, a flam's main note louder: both stay.
 */
export const BOUNCE_MS = 60, BOUNCE_RATIO = 0.7;
const last = new Map<number, { time: number; velocity: number }>();

/**
 * Crosstalk on the MPS-150: a soft snare stroke (a ghost, velocity ≤ CROSSTALK_SNARE_MAX) can also fire the hi-hat
 * ~10 ms later, no louder than the snare. Real hi-hat strokes in ghost-note grooves are far louder, and a backbeat
 * never causes it, so only that soft echo is dropped.
 */
export const CROSSTALK_MS = 15, CROSSTALK_SNARE_MAX = 44;
let lastSnare = { time: -Infinity, velocity: 0 };

export function emitNote(note: number, velocity: number, time = performance.now()) {
  const prev = last.get(note);
  last.set(note, { time, velocity });
  const pad = padForNote(getNoteMap(), note), cal = pad ? getPadCal()[pad] : undefined; // N9: the pad's own retrigger window and loudness
  if (prev && time - prev.time >= 0 && time - prev.time < (cal?.bounceMs ?? BOUNCE_MS) && velocity < prev.velocity * (cal?.bounceRatio ?? BOUNCE_RATIO)) return;
  if (pad === 'snare') lastSnare = { time, velocity };
  else if ((pad === 'hhClosed' || pad === 'hhOpen') && time - lastSnare.time >= 0 && time - lastSnare.time < CROSSTALK_MS
    && lastSnare.velocity <= CROSSTALK_SNARE_MAX && velocity <= lastSnare.velocity) return;
  const hit: Hit = { note, velocity: mapVelocity(velocity, cal), time, pad }; // raw velocities above (filters), the common scale from here
  listeners.forEach(l => l(hit));
}

const rawListeners = new Set<(data: ArrayLike<number>, time: number) => void>();
/** Every raw MIDI message as it arrives (dev: recording real-kit fixtures, N11). */
export function onRawMidi(fn: (data: ArrayLike<number>, time: number) => void) {
  rawListeners.add(fn);
  return () => { rawListeners.delete(fn); };
}

/** Simulates the kit: sends whatever note the pad is mapped to, so it goes through the same path. */
/** Raw MIDI bytes from the kit (or the emulated kit) at `time`: only Note On becomes a hit. */
export function receiveMidi(data: ArrayLike<number>, time: number) {
  rawListeners.forEach(l => l(data, time));
  const n = parseMidiMessage(data);
  if (n) emitNote(n.note, n.velocity, time);
}

export const emitPad = (pad: PadId, velocity: number, time?: number) => emitNote(getNoteMap()[pad], velocity, time);
