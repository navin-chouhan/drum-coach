import { describe, expect, it } from 'vitest';

import { matchOnsets, summarizeTiming } from './timingProbe';

describe('timing probe summary (T6-8)', () => {
  const base = 1e9;
  const scheduled = Array.from({ length: 600 }, (_, k) => base + 300 + k * 500); // 5 min at 120 BPM

  it('a constant offset is removed; the residual is the jitter', () => {
    // onsets 5.7 ms after the schedule time, ±0.2 ms alternating jitter
    const onsets = scheduled.map((s, k) => s + 5.7 + (k % 2 ? 0.2 : -0.2));
    const s = summarizeTiming(scheduled, onsets);
    expect(s.matched).toBe(600);
    expect(s.meanMs).toBeCloseTo(5.7, 6); // 1e9 + 5.7 − 1e9 is 5.7 to ~1e-7
    expect(s.p99AbsMs).toBeCloseTo(0.2, 6);
    expect(Math.abs(s.slopeMsPer5Min)).toBeLessThan(0.01);
    expect(s.spanS).toBeCloseTo(299.5, 6);
  });

  it('measures drift as a slope (100 ppm = 30 ms per 5 min)', () => {
    const onsets = scheduled.map(s => s + 2 + (s - scheduled[0]) * 100e-6);
    expect(summarizeTiming(scheduled, onsets).slopeMsPer5Min).toBeCloseTo(30, 6);
  });

  it('counts missing and extra onsets; each onset matches once', () => {
    const onsets = [scheduled[0] + 1, scheduled[2] + 1, scheduled[2] + 1.5, base + 100_000_000];
    const s = summarizeTiming(scheduled.slice(0, 3), onsets);
    expect(s).toMatchObject({ matched: 2, unmatchedScheduled: 1, unmatchedOnsets: 2 });
    expect(matchOnsets([base, base + 1], [base + 0.5])).toEqual([{ at: base, err: 0.5 }]);
  });

  it('no matches → zeros', () => {
    expect(summarizeTiming([], [])).toMatchObject({ matched: 0, meanMs: 0, p99AbsMs: 0 });
  });
});
