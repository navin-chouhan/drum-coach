import { describe, expect, it } from 'vitest';

import type { AudioEvent, SoundId } from '@drum-coach/core/play/audioPort';
import { busOfSound, packEvents, PAD_ORDER, soundIndex, unpackEvents, wordKey } from './packing';

// ios/Core/Tests/DrumAudioCoreTests/EventPackingTests.swift reads the same `packedVectors`.

const words = new Map([['one', 1000], ['and', 1001]]);

describe('soundIndex', () => {
  it('clicks 0–2, drums 10–19 in the web PADS order, words from prepareWords', () => {
    expect(soundIndex('click.bar', words)).toBe(0);
    expect(soundIndex('click.beat', words)).toBe(1);
    expect(soundIndex('click.sub', words)).toBe(2);
    expect(PAD_ORDER.map(p => soundIndex(`drum.${p}`, words))).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(soundIndex('word.One ', words)).toBe(1000);
    expect(soundIndex('word.seven', words)).toBeNull();
    expect(soundIndex('drum.cowbell' as SoundId, words) /* not a pad: tests the unknown-sound path */).toBeNull();
  });
  it('buses', () => {
    expect([0, 2, 3, 9, 10, 19, 20, 999, 1000, 5000].map(busOfSound)).toEqual(
      ['click', 'click', null, null, 'drums', 'drums', null, null, 'voice', 'voice']);
  });
  it('wordKey trims and lowercases', () => expect(wordKey('  Seven ')).toBe('seven'));
});

describe('packEvents / unpackEvents', () => {
  const at = 1e9 + 0.123456; // iOS host ms: doubles keep sub-µs precision at 1e9
  const events: AudioEvent[] = [
    { kind: 'sound', at, sound: 'click.bar', gain: 1 },
    { kind: 'sound', at: at + 500, sound: 'drum.snare', gain: 0.5 },
    { kind: 'sound', at: at + 500, sound: 'word.one', gain: 1 },
    { kind: 'sound', at: at + 600, sound: 'word.seven', gain: 1 }, // not prepared
    { kind: 'band', at: at + 1000, part: 'keys', midi: [60, 64, 67], durMs: 480, vel: 90 },
    { kind: 'band', at: at + 1000, part: 'bass', midi: [], durMs: 480, vel: 90 }, // no notes
    { kind: 'band', at: at + 1500, part: 'bass', midi: [36], durMs: 240, vel: 100 },
  ];

  it('packs into flat records', () => {
    const { packed, unresolved } = packEvents(events, words);
    expect(unresolved).toBe(2);
    expect(packed).toEqual([
      0, at, 0, 1,
      0, at + 500, 11, 0.5,
      0, at + 500, 1000, 1,
      1, at + 1000, 1, 480, 90, 3, 60, 64, 67,
      1, at + 1500, 0, 240, 100, 1, 36,
    ]);
  });

  it('round-trips exactly', () => {
    const { events: out, invalid } = unpackEvents(packEvents(events, words).packed);
    expect(invalid).toBe(0);
    expect(out).toEqual([
      { kind: 'sound', at, index: 0, gain: 1 },
      { kind: 'sound', at: at + 500, index: 11, gain: 0.5 },
      { kind: 'sound', at: at + 500, index: 1000, gain: 1 },
      { kind: 'band', at: at + 1000, part: 1, durMs: 480, vel: 90, midi: [60, 64, 67] },
      { kind: 'band', at: at + 1500, part: 0, durMs: 240, vel: 100, midi: [36] },
    ]);
  });

  it('caps chords at 16 notes', () => {
    const midi = Array.from({ length: 20 }, (_, i) => 40 + i);
    const { packed } = packEvents([{ kind: 'band', at, part: 'keys', midi, durMs: 100, vel: 64 }], words);
    expect(packed[5]).toBe(16);
    expect(packed.length).toBe(6 + 16);
  });
});

// [name, packed, valid events, invalid]: the shared vectors for the Swift reader.
const packedVectors: [string, number[], number, number][] = [
  ['empty', [], 0, 0],
  ['one click', [0, 1000, 0, 1], 1, 0],
  ['click + band', [0, 1000, 1, 0.75, 1, 1100, 0, 240, 100, 1, 36], 2, 0],
  ['NaN time skipped, next kept', [0, NaN, 0, 1, 0, 1000, 2, 0.35], 1, 1],
  ['negative index skipped', [0, 1000, -1, 1, 0, 1000, 1, 1], 1, 1],
  ['fractional index skipped', [0, 1000, 1.5, 1], 0, 1],
  ['huge index skipped', [0, 1000, 1e300, 1], 0, 1],
  ['truncated sound stops reading', [0, 1000, 1], 0, 1],
  ['unknown kind stops reading', [7, 1000, 0, 1, 0, 1000, 0, 1], 0, 1],
  ['band n = 0 stops reading', [1, 1000, 0, 240, 100, 0], 0, 1],
  ['band n = 17 stops reading', [1, 1000, 0, 240, 100, 17], 0, 1],
  ['band n past the end stops reading', [1, 1000, 0, 240, 100, 3, 36, 40], 0, 1],
  ['band note 128 skipped', [1, 1000, 0, 240, 100, 1, 128, 0, 1000, 0, 1], 1, 1],
  ['band part 2 skipped', [1, 1000, 2, 240, 100, 1, 36], 0, 1],
  ['band duration 0 skipped', [1, 1000, 0, 0, 100, 1, 36], 0, 1],
  ['click after a good band', [1, 1000, 1, 480, 90, 3, 60, 64, 67, 0, 1200, 0, 1], 2, 0],
];

describe('unpackEvents validation (shared vectors)', () => {
  for (const [name, packed, valid, invalid] of packedVectors) {
    it(name, () => {
      const r = unpackEvents(packed);
      expect(r.events.length).toBe(valid);
      expect(r.invalid).toBe(invalid);
    });
  }
});
