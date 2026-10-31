import { describe, expect, it } from 'vitest';

import { createDriftRecorder, loopDriftMs, loopSegments, nextBarAt, toneBpm } from './backingProbe';

describe('nextBarAt', () => {
  it('the first bar line at or after now + lead', () => {
    expect(nextBarAt(1000, 2000, 1000, 300)).toBe(3000);
    expect(nextBarAt(1000, 2000, 2700, 300)).toBe(3000);
    expect(nextBarAt(1000, 2000, 2701, 300)).toBe(5000);
    expect(nextBarAt(1e9, 2000, 1e9 - 5000, 300)).toBe(1e9); // the metronome hasn't started yet: its first bar
  });
});

describe('toneBpm', () => {
  it('writes the tone slower for slower rates so its beats stay on the click', () => {
    expect(toneBpm(120, 1)).toBe(120);
    expect(toneBpm(120, 0.5)).toBe(240);
  });
});

describe('a looped bar (F2)', () => {
  const req = { at: 1e9, offsetMs: 0, rate: 0.5, durationMs: 1000 }; // a 1 s bar of file, heard over 2 s
  it('queues the next bars on the same line', () => {
    expect(loopSegments(req, 2000, 3)).toEqual([1, 2, 3].map(k => ({ at: 1e9 + k * 2000, offsetMs: 0, durationMs: 1000 })));
    expect(loopSegments({ at: 0, offsetMs: 0, rate: 1 }, 500, 1)).toEqual([{ at: 500, offsetMs: 0, durationMs: 500 }]);
    expect(loopSegments(req, 2000, -1)).toEqual([]);
  });
  it('reads the drift against the repeat the anchor is in', () => {
    expect(loopDriftMs(req, 2000, { at: 1e9 + 4000 + 1.5, fileMs: 0 })).toBeCloseTo(1.5, 9); // repeat 2, 1.5 ms late
    expect(loopDriftMs(req, 2000, { at: 1e9 + 2000 - 0.5, fileMs: 0 })).toBeCloseTo(-0.5, 9); // repeat 1, early
    expect(loopDriftMs(req, 2000, { at: 1e9 + 100, fileMs: 50 })).toBeCloseTo(0, 9);
    expect(loopDriftMs(req, undefined, { at: 1e9 + 4000, fileMs: 0 })).toBe(4000); // not looped: the single line
  });
  it('a recorder of a loop keeps reading through the seams', () => {
    let a: { at: number; fileMs: number } | null = { at: 1e9 + 1999, fileMs: 999.5 };
    const rec = createDriftRecorder({ anchor: () => a }, req, 10_000, 2000);
    rec.poll();
    a = { at: 1e9 + 2001, fileMs: 0.5 };
    rec.poll();
    expect(rec.summary().minMs).toBeCloseTo(0, 9);
    expect(rec.summary().maxMs).toBeCloseTo(0, 9);
  });
});

describe('createDriftRecorder', () => {
  it('records each new anchor once, against the requested line, for the window', () => {
    let a: { at: number; fileMs: number } | null = null;
    const req = { at: 1e9, offsetMs: 0, rate: 1 };
    const rec = createDriftRecorder({ anchor: () => a }, req, 1000);
    expect(rec.poll()).toBe(true); // nothing heard yet
    a = { at: 1e9 + 100, fileMs: 99 }; // heard 1 ms late
    expect(rec.poll()).toBe(true);
    expect(rec.poll()).toBe(true); // same render cycle: not counted again
    a = { at: 1e9 + 600, fileMs: 598 };
    rec.poll();
    a = { at: 1e9 + 1100, fileMs: 1097 };
    expect(rec.poll()).toBe(false); // window over
    expect(rec.poll()).toBe(false);
    const s = rec.summary();
    expect(s.n).toBe(3);
    expect(s.done).toBe(true);
    expect(s.elapsedMs).toBe(1000);
    expect(s.lastMs).toBeCloseTo(3, 6);
    expect(s.slopeMsPerMin).toBeCloseTo(120, 3); // 1 ms per 500 ms
  });
});
