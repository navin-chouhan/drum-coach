// Delay statistics for the MIDI debug screen (ported from spikes/midi-probe/src/shared/stats.ts).

export type Summary = { n: number; min: number; median: number; p95: number; max: number; mean: number };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Nearest-rank p95; the median averages the middle two. null when there are no samples. */
export function summarize(xs: readonly number[]): Summary | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), n = s.length, mid = n >> 1;
  const median = n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  const p95 = s[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  return { n, min: r2(s[0]), median: r2(median), p95: r2(p95), max: r2(s[n - 1]), mean: r2(s.reduce((a, b) => a + b, 0) / n) };
}

/** A bounded sample buffer: keeps the last `cap` values. Adding is cheap; summary() sorts a copy. */
export type Samples = { add: (x: number) => void; reset: () => void; values: () => readonly number[]; summary: () => Summary | null };

export function createSamples(cap = 5000): Samples {
  let xs: number[] = [];
  return {
    add(x) {
      xs.push(x);
      if (xs.length > cap * 1.25) xs = xs.slice(xs.length - cap); // trim in steps, not on every add
    },
    reset() { xs = []; },
    values: () => (xs.length > cap ? xs.slice(xs.length - cap) : xs),
    summary: () => summarize(xs.length > cap ? xs.slice(xs.length - cap) : xs),
  };
}
