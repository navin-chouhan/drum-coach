import { describe, expect, it } from 'vitest';
import { classify, toHex } from './classify';
import { DEFAULT_NOTE_MAP } from './kit';
import { parseMidiMessage } from './midi';

const c = (...m: number[]) => classify(m, DEFAULT_NOTE_MAP);

describe('classify (CLAUDE.md hard facts)', () => {
  it('names clock and active sensing', () => {
    expect(c(0xf8).kind).toBe('clock');
    expect(c(0xfe).kind).toBe('activeSensing');
    expect(c(0xfa).kind).toBe('otherRealtime');
  });

  it('a Note On on channel 10 with the pad name from the MPS-150 map', () => {
    expect(c(0x99, 38, 100)).toMatchObject({ kind: 'noteOn', channel: 10, note: 38, velocity: 100, padName: 'Snare' });
    expect(c(0x99, 48, 60).padName).toBe('Tom 1');
    expect(c(0x99, 46, 60).padName).toBe('Hi-hat open');
  });

  it('Note On velocity 0 and real Note Off are both note-offs', () => {
    expect(c(0x99, 38, 0).kind).toBe('noteOff');
    expect(c(0x89, 38, 64).kind).toBe('noteOff');
  });

  it('poly aftertouch 127 on 42/44/46 is the pedal choke, not a hit', () => {
    for (const n of [42, 44, 46]) expect(c(0xa9, n, 127)).toMatchObject({ kind: 'polyAftertouch', choke: true });
    expect(c(0xa9, 38, 127).choke).toBe(false);
    expect(c(0xa9, 46, 100).choke).toBe(false);
    expect(parseMidiMessage([0xa9, 46, 127])).toBeNull();
  });

  it('formats hex', () => expect(toHex([0x99, 38, 7])).toBe('99 26 07'));
});

describe('parseMidiMessage (copied from src/engine/midi.ts)', () => {
  it('only Note On velocity > 0 is a hit, on any channel', () => {
    expect(parseMidiMessage([0x99, 38, 90])).toEqual({ note: 38, velocity: 90 });
    expect(parseMidiMessage([0x90, 38, 90])).toEqual({ note: 38, velocity: 90 });
    expect(parseMidiMessage([0x99, 38, 0])).toBeNull();
    expect(parseMidiMessage([0x89, 38, 90])).toBeNull();
    expect(parseMidiMessage([0xf8])).toBeNull();
    expect(parseMidiMessage([0xfe])).toBeNull();
  });
});
