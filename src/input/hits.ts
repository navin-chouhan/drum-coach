import { padForNote, type PadId } from '../engine/kit';
import { getNoteMap } from './store';

/** time is performance.now() milliseconds (same clock as MIDIMessageEvent.timeStamp). */
export type Hit = { note: number; velocity: number; time: number; pad?: PadId };

const listeners = new Set<(h: Hit) => void>();

export function onHit(fn: (h: Hit) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function emitNote(note: number, velocity: number, time = performance.now()) {
  const hit: Hit = { note, velocity, time, pad: padForNote(getNoteMap(), note) };
  listeners.forEach(l => l(hit));
}

/** Simulates the kit: sends whatever note the pad is mapped to, so it goes through the same path. */
export const emitPad = (pad: PadId, velocity: number, time?: number) => emitNote(getNoteMap()[pad], velocity, time);
