export type NoteOn = { note: number; velocity: number };

/**
 * Returns a Note On with velocity > 0, else null. Drops Clock (0xF8), Active Sensing (0xFE),
 * Note Off, Note On velocity 0, and poly aftertouch (the hi-hat pedal choke — not a hit).
 * Any channel is accepted; the MPS-150 uses channel 10.
 */
export function parseMidiMessage(data: ArrayLike<number>): NoteOn | null {
  if (data.length < 3 || (data[0] & 0xf0) !== 0x90 || data[2] === 0) return null;
  return { note: data[1], velocity: data[2] };
}
