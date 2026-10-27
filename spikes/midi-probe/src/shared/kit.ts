// Copied from src/engine/kit.ts (PADS, PAD_INFO names, NoteMap, DEFAULT_NOTE_MAP, padForNote) for Gate 0;
// moves to @drum-coach/core in A1. Semantics unchanged. Only the parts the probe needs (no hints, no drums, no
// parseNoteMap/findConflicts).

export const PADS = [
  'kick', 'snare', 'hhClosed', 'hhOpen', 'hhPedal', 'tom1', 'tom2', 'floor', 'crash', 'ride',
] as const;
export type PadId = (typeof PADS)[number];

export const PAD_NAMES: Record<PadId, string> = {
  kick: 'Kick', snare: 'Snare', hhClosed: 'Hi-hat closed', hhOpen: 'Hi-hat open', hhPedal: 'Hi-hat pedal',
  tom1: 'Tom 1', tom2: 'Tom 2', floor: 'Floor tom', crash: 'Crash', ride: 'Ride',
};

/** One MIDI note per pad. */
export type NoteMap = Record<PadId, number>;

// MPS-150 defaults, verified on the real kit (docs/KIT.md).
export const DEFAULT_NOTE_MAP: NoteMap = {
  kick: 36, snare: 38, hhClosed: 42, hhOpen: 46, hhPedal: 44,
  tom1: 48, tom2: 45, floor: 43, crash: 49, ride: 51,
};

/** Pad for a note; with duplicate notes the first pad in PADS order wins (see findConflicts). */
export function padForNote(map: NoteMap, note: number): PadId | undefined {
  return PADS.find(p => map[p] === note);
}
