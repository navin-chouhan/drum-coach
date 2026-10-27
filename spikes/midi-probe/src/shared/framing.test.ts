import { describe, expect, it } from 'vitest';
import { createFramer, dataLength } from './framing';

const frame = (...runs: number[][]) => {
  const f = createFramer();
  const out = runs.flatMap(r => f.push(r));
  return { out, stats: f.stats };
};

describe('dataLength', () => {
  it('knows every channel and system-common status', () => {
    expect([0x80, 0x99, 0xa9, 0xb0, 0xc0, 0xdf, 0xe0].map(dataLength)).toEqual([2, 2, 2, 2, 1, 1, 2]);
    expect([0xf1, 0xf2, 0xf3, 0xf6].map(dataLength)).toEqual([1, 2, 1, 0]);
    expect([0xf0, 0xf4, 0xf5, 0xf7].map(dataLength)).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('framing a CoreMIDI byte run into messages', () => {
  it('passes single complete messages through', () => {
    expect(frame([0x99, 38, 100]).out).toEqual([[0x99, 38, 100]]);
    expect(frame([0xf8]).out).toEqual([[0xf8]]);
  });

  it('splits several messages in one packet (a hit, its off, a clock)', () => {
    expect(frame([0x99, 38, 100, 0x99, 38, 0, 0xf8]).out).toEqual([[0x99, 38, 100], [0x99, 38, 0], [0xf8]]);
  });

  it('pulls realtime bytes out from inside a message without breaking it', () => {
    expect(frame([0x99, 0xf8, 36, 0xfe, 90]).out).toEqual([[0xf8], [0xfe], [0x99, 36, 90]]);
  });

  it('expands running status, also across realtime bytes and packets', () => {
    expect(frame([0x99, 38, 100, 36, 80, 0xf8, 38, 0]).out).toEqual([[0x99, 38, 100], [0x99, 36, 80], [0xf8], [0x99, 38, 0]]);
    expect(frame([0x99, 38, 100], [42, 70]).out).toEqual([[0x99, 38, 100], [0x99, 42, 70]]);
  });

  it('completes a message split across two packets', () => {
    expect(frame([0x99, 38], [100]).out).toEqual([[0x99, 38, 100]]);
  });

  it('handles the hi-hat pedal choke (poly aftertouch) and 1-byte-data messages', () => {
    expect(frame([0xa9, 46, 127, 0xa9, 42, 127, 0xc9, 5, 0xd9, 64]).out)
      .toEqual([[0xa9, 46, 127], [0xa9, 42, 127], [0xc9, 5], [0xd9, 64]]);
  });

  it('system common clears running status; stray data is dropped and counted', () => {
    const { out, stats } = frame([0x99, 38, 100, 0xf2, 1, 2, 38, 100]);
    expect(out).toEqual([[0x99, 38, 100], [0xf2, 1, 2]]);
    expect(stats.droppedBytes).toBe(2);
    expect(frame([38, 100]).stats.droppedBytes).toBe(2); // no status ever seen
  });

  it('drops an incomplete message when a new status arrives', () => {
    const { out, stats } = frame([0x99, 38, 0x99, 36, 90]);
    expect(out).toEqual([[0x99, 36, 90]]);
    expect(stats.droppedBytes).toBe(2);
  });

  it('assembles sysex across packets, with realtime inside it', () => {
    const { out, stats } = frame([0xf0, 0x7e, 0x7f], [0xf8, 0x06, 0x01, 0xf7, 0x99, 38, 1]);
    expect(out).toEqual([[0xf8], [0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7], [0x99, 38, 1]]);
    expect(stats.sysex).toBe(1);
  });

  it('ends an unterminated sysex at the next status byte', () => {
    const { out, stats } = frame([0xf0, 1, 2, 0x99, 38, 100]);
    expect(out).toEqual([[0x99, 38, 100]]);
    expect(stats.droppedBytes).toBe(3);
  });

  it('drops undefined system statuses and a stray F7', () => {
    const { out, stats } = frame([0xf4, 0xf5, 0xf7, 0xf6]);
    expect(out).toEqual([[0xf6]]);
    expect(stats.droppedBytes).toBe(3);
  });

  it('reset forgets running status and partial messages', () => {
    const f = createFramer();
    f.push([0x99, 38]);
    f.reset();
    expect(f.push([100, 0x99, 36, 90])).toEqual([[0x99, 36, 90]]);
  });
});
