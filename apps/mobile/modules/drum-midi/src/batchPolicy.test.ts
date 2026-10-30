import { describe, expect, it } from 'vitest';

import { classifyPacket, defaultBatchPolicy, flushReason, maxWait, nextDeadline, type BatchPolicy, type FlushReason, type PacketKind } from './batchPolicy';

// The shared vectors: ios/Tests/BatchPolicyTests.swift checks the Swift mirror against the same table.
const vectors: [string, number[], PacketKind][] = [
  ['clock', [0xf8], 'realtimeOnly'],
  ['active sensing', [0xfe], 'realtimeOnly'],
  ['two clocks', [0xf8, 0xf8], 'realtimeOnly'],
  ['empty', [], 'realtimeOnly'],
  ['snare hit ch10', [0x99, 38, 100], 'noteOn'],
  ['kick hit ch1', [0x90, 36, 15], 'noteOn'],
  ['note-off as note-on vel 0', [0x99, 38, 0], 'other'],
  ['real note-off', [0x89, 38, 64], 'other'],
  ['hi-hat choke (poly AT 127)', [0xa9, 46, 127], 'other'],
  ['CC hi-hat pedal', [0xb9, 4, 90], 'other'],
  ['running status: off then on', [0x99, 36, 0, 38, 90], 'noteOn'],
  ['running status: two offs', [0x99, 36, 0, 38, 0], 'other'],
  ['clock inside a note-on', [0x99, 0xf8, 38, 0xf8, 100], 'noteOn'],
  ['clock then hit', [0xf8, 0x99, 42, 80], 'noteOn'],
  ['choke then hit', [0xa9, 46, 127, 0x99, 42, 80], 'noteOn'],
  ['note-on cut short', [0x99, 38], 'other'],
  ['sysex with 0x90-like data stays sysex', [0xf0, 0x7e, 0x10, 0x20, 0xf7], 'other'],
  ['data after sysex has no running status', [0xf0, 0x01, 0xf7, 38, 100], 'other'],
  ['song position', [0xf2, 0x10, 0x20], 'other'],
];

describe('classifyPacket', () => {
  for (const [name, bytes, kind] of vectors) {
    it(`${name} → ${kind}`, () => expect(classifyPacket(bytes)).toBe(kind));
  }

  it('accepts typed arrays', () => expect(classifyPacket(Uint8Array.from([0x99, 38, 100]))).toBe('noteOn'));
});

describe('deadline and flush', () => {
  it('waits 0 / 8 / 33 ms by kind', () => {
    expect(maxWait('noteOn')).toBe(0);
    expect(maxWait('other')).toBe(8);
    expect(maxWait('realtimeOnly')).toBe(33);
  });

  it('keeps the earliest deadline', () => {
    expect(nextDeadline(null, 'realtimeOnly', 100)).toBe(133);
    expect(nextDeadline(133, 'other', 110)).toBe(118); // a note-off pulls a clock batch forward
    expect(nextDeadline(118, 'realtimeOnly', 112)).toBe(118); // a clock never pushes it back
    expect(nextDeadline(118, 'noteOn', 115)).toBe(115);
  });

  it('flushes a note-on at once, a full batch at once, else at the deadline', () => {
    expect(flushReason('noteOn', 1, 100, 100)).toBe('noteOn');
    expect(flushReason('realtimeOnly', 5, 133, 101)).toBeNull();
    expect(flushReason('realtimeOnly', defaultBatchPolicy.maxPackets, 133, 101)).toBe('full');
    expect(flushReason(null, 3, 133, 132.9)).toBeNull();
    expect(flushReason(null, 3, 133, 133)).toBe('deadline');
    expect(flushReason(null, 0, 133, 200)).toBeNull(); // nothing to send
  });
});

// ---- A model of the native loop (ios/PacketBatcher.swift) with a perfect timer, for whole-stream properties ----

type Arrival = { atMs: number; bytes: number[] };
type Batch = { sentMs: number; reason: FlushReason; packets: Arrival[] };

function simulate(arrivals: Arrival[], policy: BatchPolicy = defaultBatchPolicy): Batch[] {
  const out: Batch[] = [];
  let pending: Arrival[] = [];
  let deadline: number | null = null;
  const send = (sentMs: number, reason: FlushReason) => {
    out.push({ sentMs, reason, packets: pending });
    pending = [];
    deadline = null;
  };
  for (const a of arrivals) {
    if (deadline != null && deadline <= a.atMs && pending.length) send(deadline, 'deadline'); // the timer fired first
    const kind = classifyPacket(a.bytes);
    pending.push(a);
    deadline = nextDeadline(deadline, kind, a.atMs, policy);
    const reason = flushReason(kind, pending.length, deadline, a.atMs, policy);
    if (reason) send(a.atMs, reason);
  }
  if (pending.length && deadline != null) send(deadline, 'deadline');
  return out;
}

const CLOCK = [0xf8];
const SENSE = [0xfe];

/** The kit at rest: clock every 24.3 ms (GATE0 §9) and active sensing every 250 ms, for `ms`. */
function idleStream(ms: number): Arrival[] {
  const out: Arrival[] = [];
  for (let t = 0; t < ms; t += 24.3) out.push({ atMs: t, bytes: CLOCK });
  for (let t = 7; t < ms; t += 250) out.push({ atMs: t, bytes: SENSE });
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** Merges streams by time; on equal times the earlier stream's packet comes first. */
const merge = (...streams: Arrival[][]) => streams.flatMap((s, i) => s.map(a => ({ a, i }))).sort((x, y) => x.a.atMs - y.a.atMs || x.i - y.i).map(x => x.a);

describe('the native loop (model)', () => {
  it('halves the events of an idle kit and holds a clock at most 33 ms', () => {
    const arrivals = idleStream(10_000);
    const batches = simulate(arrivals);
    expect(batches.flatMap(b => b.packets)).toEqual(arrivals); // nothing lost, order kept
    expect(arrivals.length).toBeGreaterThan(400); // ~41 clocks/s + 4 sensing/s
    expect(batches.length).toBeLessThanOrEqual(arrivals.length / 2 + 1);
    for (const b of batches) {
      expect(b.reason).toBe('deadline');
      for (const p of b.packets) expect(b.sentMs - p.atMs).toBeLessThanOrEqual(33 + 1e-9);
    }
  });

  it('sends every hit the moment it arrives, with the clocks before it, in order', () => {
    const hits: Arrival[] = [];
    for (let t = 3; t < 5000; t += 125) hits.push({ atMs: t, bytes: [0x99, 38, 90] }, { atMs: t + 60, bytes: [0x99, 38, 0] });
    const arrivals = merge(idleStream(5000), hits);
    const batches = simulate(arrivals);
    expect(batches.flatMap(b => b.packets)).toEqual(arrivals);
    for (const b of batches) {
      for (const p of b.packets) {
        const kind = classifyPacket(p.bytes);
        const waited = b.sentMs - p.atMs;
        if (kind === 'noteOn') {
          expect(waited).toBe(0);
          expect(b.packets[b.packets.length - 1]).toBe(p); // a hit closes its batch
        } else if (kind === 'other') expect(waited).toBeLessThanOrEqual(8 + 1e-9);
        else expect(waited).toBeLessThanOrEqual(33 + 1e-9);
      }
    }
  });

  it('a note-off pulls a pending clock batch forward to 8 ms', () => {
    const batches = simulate([
      { atMs: 0, bytes: CLOCK },
      { atMs: 5, bytes: [0x99, 38, 0] },
      { atMs: 20, bytes: CLOCK },
    ]);
    expect(batches.map(b => [b.sentMs, b.packets.length])).toEqual([[13, 2], [53, 1]]);
  });

  it('a burst never grows past maxPackets', () => {
    const policy = { ...defaultBatchPolicy, maxPackets: 4 };
    const burst = Array.from({ length: 10 }, (_, i) => ({ atMs: i * 0.1, bytes: CLOCK }));
    const batches = simulate(burst, policy);
    expect(batches.map(b => [b.reason, b.packets.length])).toEqual([['full', 4], ['full', 4], ['deadline', 2]]);
  });

  it('a hit in the same packet as a clock is not delayed', () => {
    const batches = simulate([{ atMs: 10, bytes: [0xf8, 0x99, 36, 127] }]);
    expect(batches).toEqual([{ sentMs: 10, reason: 'noteOn', packets: [{ atMs: 10, bytes: [0xf8, 0x99, 36, 127] }] }]);
  });
});
