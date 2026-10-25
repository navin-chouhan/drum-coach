import { padForNote, type PadId } from '../engine/kit';
import { parseMidiMessage } from '../engine/midi';
import { getNoteMap } from './store';

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

export function emitNote(note: number, velocity: number, time = performance.now()) {
  const prev = last.get(note);
  last.set(note, { time, velocity });
  if (prev && time - prev.time >= 0 && time - prev.time < BOUNCE_MS && velocity < prev.velocity * BOUNCE_RATIO) return;
  const hit: Hit = { note, velocity, time, pad: padForNote(getNoteMap(), note) };
  listeners.forEach(l => l(hit));
}

/** Simulates the kit: sends whatever note the pad is mapped to, so it goes through the same path. */
/** Raw MIDI bytes from the kit (or the emulated kit) at `time`: only Note On becomes a hit. */
export function receiveMidi(data: ArrayLike<number>, time: number) {
  const n = parseMidiMessage(data);
  if (n) emitNote(n.note, n.velocity, time);
}

export const emitPad = (pad: PadId, velocity: number, time?: number) => emitNote(getNoteMap()[pad], velocity, time);
