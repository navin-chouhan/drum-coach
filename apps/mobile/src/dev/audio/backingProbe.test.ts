import { describe, expect, it } from 'vitest';

import { createDriftRecorder, nextBarAt, toneBpm } from './backingProbe';

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
