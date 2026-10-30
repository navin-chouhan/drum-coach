// AudioEvent[] ↔ the flat number[] the native `schedule` takes (one JSI array of doubles instead of an array of
// objects). ios/Core/Sources/DrumAudioCore/EventPacking.swift mirrors `unpackEvents` and the sound table: change both
// together; packing.test.ts and the Swift tests share the vectors.
//
// Records (variable length, back to back):
//   sound: [0, at, soundIndex, gain]
//   band:  [1, at, part (0 bass, 1 keys), durMs, vel, n, midi_1 … midi_n]   (1 ≤ n ≤ 16)

import type { AudioEvent, SoundId } from '@drum-coach/core/play/audioPort';

export const KIND_SOUND = 0;
export const KIND_BAND = 1;
export const MAX_BAND_NOTES = 16;

/** The pads in the web's order (src/engine/kit.ts PADS). Index 10 + position is the drum's sound index. */
export const PAD_ORDER = ['kick', 'snare', 'hhClosed', 'hhOpen', 'hhPedal', 'tom1', 'tom2', 'floor', 'crash', 'ride'] as const;

/** Fixed sound indexes. Words get theirs from native prepareWords (FIRST_WORD_INDEX and up). */
export const SOUND_INDEX = Object.freeze({ 'click.bar': 0, 'click.beat': 1, 'click.sub': 2, firstDrum: 10, firstWord: 1000 });

/** The normalised text a word is cached under (native uses the same rule). */
export function wordKey(text: string): string {
  return text.trim().toLowerCase();
}

/** A SoundId's native index, or null (an unknown pad, or a word not prepared). `words` maps wordKey → index. */
export function soundIndex(sound: SoundId, words: ReadonlyMap<string, number>): number | null {
  switch (sound) {
    case 'click.bar':
    case 'click.beat':
    case 'click.sub':
      return SOUND_INDEX[sound];
  }
  if (sound.startsWith('drum.')) {
    const i = (PAD_ORDER as readonly string[]).indexOf(sound.slice(5));
    return i < 0 ? null : SOUND_INDEX.firstDrum + i;
  }
  if (sound.startsWith('word.')) return words.get(wordKey(sound.slice(5))) ?? null;
  return null;
}

/** The bus a sound index plays on. */
export function busOfSound(index: number): 'click' | 'drums' | 'voice' | null {
  if (index >= 0 && index <= 2) return 'click';
  if (index >= SOUND_INDEX.firstDrum && index < SOUND_INDEX.firstDrum + PAD_ORDER.length) return 'drums';
  if (index >= SOUND_INDEX.firstWord) return 'voice';
  return null;
}

/**
 * Packs events for native. Sounds that don't resolve (unprepared words, unknown pads) and band events with no notes
 * are left out and counted in `unresolved`. Native validates everything again.
 */
export function packEvents(events: readonly AudioEvent[], words: ReadonlyMap<string, number>): { packed: number[]; unresolved: number } {
  const packed: number[] = [];
  let unresolved = 0;
  for (const e of events) {
    if (e.kind === 'sound') {
      const index = soundIndex(e.sound, words);
      if (index == null) unresolved++;
      else packed.push(KIND_SOUND, e.at, index, e.gain);
    } else {
      const notes = e.midi.slice(0, MAX_BAND_NOTES);
      if (notes.length === 0) unresolved++;
      else packed.push(KIND_BAND, e.at, e.part === 'bass' ? 0 : 1, e.durMs, e.vel, notes.length, ...notes);
    }
  }
  return { packed, unresolved };
}

/** One unpacked record, as native sees it. */
export type PackedEvent =
  | { kind: 'sound'; at: number; index: number; gain: number }
  | { kind: 'band'; at: number; part: 0 | 1; durMs: number; vel: number; midi: number[] };

const finite = (x: number | undefined): x is number => x !== undefined && Number.isFinite(x);
const isInt = (x: number) => Number.isInteger(x);

/**
 * The native side's reader (mirrored in Swift): reads records until the array ends. A malformed record makes the rest
 * unreadable, so reading stops there and the remaining values count as one `invalid`; a well-formed record with a bad
 * value (NaN time, unknown kind index, a note outside 0–127, duration ≤ 0) is skipped and counted.
 */
export function unpackEvents(data: readonly number[]): { events: PackedEvent[]; invalid: number } {
  const events: PackedEvent[] = [];
  let invalid = 0;
  let i = 0;
  while (i < data.length) {
    const kind = data[i];
    if (kind === KIND_SOUND) {
      if (i + 4 > data.length) return { events, invalid: invalid + 1 };
      const at = data[i + 1], index = data[i + 2], gain = data[i + 3];
      i += 4;
      if (finite(at) && finite(index) && isInt(index) && index >= 0 && finite(gain)) events.push({ kind: 'sound', at, index, gain });
      else invalid++;
    } else if (kind === KIND_BAND) {
      if (i + 6 > data.length) return { events, invalid: invalid + 1 };
      const n = data[i + 5];
      if (!finite(n) || !isInt(n) || n < 1 || n > MAX_BAND_NOTES || i + 6 + n > data.length) return { events, invalid: invalid + 1 };
      const at = data[i + 1], part = data[i + 2], durMs = data[i + 3], vel = data[i + 4];
      const midi = data.slice(i + 6, i + 6 + n);
      i += 6 + n;
      const notesOk = midi.every(m => finite(m) && m >= 0 && m <= 127);
      if (finite(at) && (part === 0 || part === 1) && finite(durMs) && durMs > 0 && finite(vel) && notesOk)
        events.push({ kind: 'band', at, part, durMs, vel, midi });
      else invalid++;
    } else {
      return { events, invalid: invalid + 1 };
    }
  }
  return { events, invalid };
}
