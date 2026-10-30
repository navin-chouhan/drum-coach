// Copied from spikes/midi-probe/src/shared/umpUnpack.test.ts (spike commit e9fb55a, 2026-10-27) on 2026-10-30 (A1). The spike keeps its own copy.
import { describe, expect, it } from 'vitest';
import { createFramer } from './framing.ts';
import { unpack } from './umpUnpack.ts';

// UMP words as CoreMIDI delivers MIDI 1.0 traffic under kMIDIProtocol_1_0 (group 0).
const cv = (status: number, d1: number, d2 = 0) => ((0x2 << 28) | (status << 16) | (d1 << 8) | d2) >>> 0;
const sys = (status: number, d1 = 0, d2 = 0) => ((0x1 << 28) | (status << 16) | (d1 << 8) | d2) >>> 0;

describe('UMP → MIDI 1.0 bytes (model of ios/UmpUnpack.swift)', () => {
  it('channel voice: 3 bytes, program change and channel pressure 2', () => {
    expect(unpack([cv(0x99, 38, 100)])).toEqual([0x99, 38, 100]);
    expect(unpack([cv(0xa9, 46, 127)])).toEqual([0xa9, 46, 127]);
    expect(unpack([cv(0xc9, 5), cv(0xd9, 64)])).toEqual([0xc9, 5, 0xd9, 64]);
  });

  it('system realtime is 1 byte; system common carries its data', () => {
    expect(unpack([sys(0xf8), sys(0xfe)])).toEqual([0xf8, 0xfe]);
    expect(unpack([sys(0xf2, 1, 2), sys(0xf3, 7)])).toEqual([0xf2, 1, 2, 0xf3, 7]);
  });

  it('sysex: complete, and start/end across two UMPs', () => {
    const sx = (kind: number, n: number, b: number[]) => [
      ((0x3 << 28) | (kind << 20) | (n << 16) | ((b[0] ?? 0) << 8) | (b[1] ?? 0)) >>> 0,
      (((b[2] ?? 0) << 24) | ((b[3] ?? 0) << 16) | ((b[4] ?? 0) << 8) | (b[5] ?? 0)) >>> 0,
    ];
    expect(unpack(sx(0, 3, [0x7e, 0x7f, 0x06]))).toEqual([0xf0, 0x7e, 0x7f, 0x06, 0xf7]);
    expect(unpack([...sx(1, 6, [1, 2, 3, 4, 5, 6]), ...sx(3, 1, [7])])).toEqual([0xf0, 1, 2, 3, 4, 5, 6, 7, 0xf7]);
  });

  it('skips utility (JR timestamp) and MIDI 2.0 UMPs by their size', () => {
    const jr = (0x0 << 28 | 0x2 << 20) >>> 0, m2 = [((0x4 << 28) | (0x99 << 16) | (38 << 8)) >>> 0, 0xffff0000];
    expect(unpack([jr, ...m2, cv(0x99, 36, 90)])).toEqual([0x99, 36, 90]);
  });

  it('a packet of a hit, a clock and a choke frames back into its messages in TS', () => {
    const bytes = unpack([cv(0x99, 38, 100), sys(0xf8), cv(0xa9, 44, 127)]);
    expect(createFramer().push(bytes)).toEqual([[0x99, 38, 100], [0xf8], [0xa9, 44, 127]]);
  });
});
