import { Midi } from '@tonejs/midi';
import { DEFAULT_NOTE_MAP, type PadId } from './kit.ts';

/**
 * A take as a standard MIDI file (N2, for a teacher): your own strokes at their real times (seconds from the take's
 * beat 1) and loudness, on the General MIDI drum channel, with the take's tempo. Played back by any DAW or MIDI player.
 */
export function takeToMidi(t: { hits: { time: number; pad?: PadId; velocity: number }[]; zero: number; bpm: number; title: string }): Uint8Array<ArrayBuffer> {
  const m = new Midi();
  m.name = t.title;
  m.header.setTempo(t.bpm);
  const track = m.addTrack();
  track.channel = 9; // GM drums
  track.name = 'Drums';
  for (const h of t.hits) if (h.pad && h.time >= t.zero - 1000)
    track.addNote({ midi: DEFAULT_NOTE_MAP[h.pad], time: Math.max(0, (h.time - t.zero) / 1000), duration: 0.1, velocity: Math.min(1, h.velocity / 127) });
  return new Uint8Array(m.toArray()); // a plain ArrayBuffer copy (a Blob part)
}
