// Gate 0 probe: summary statistics for the bridge-delay samples. New for the spike.

export type Summary = { n: number; min: number; median: number; p95: number; max: number; mean: number };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Nearest-rank p95; median averages the middle two. null when there are no samples. */
export function summarize(xs: readonly number[]): Summary | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), n = s.length, mid = n >> 1;
  const median = n % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  const p95 = s[Math.min(n - 1, Math.ceil(0.95 * n) - 1)];
  return { n, min: r2(s[0]), median: r2(median), p95: r2(p95), max: r2(s[n - 1]), mean: r2(s.reduce((a, b) => a + b, 0) / n) };
}

/** A bounded sample buffer: keeps the last `cap` values. */
export class Samples {
  private xs: number[] = [];
  constructor(private readonly cap = 20000) {}
  add(x: number) {
    this.xs.push(x);
    if (this.xs.length > this.cap) this.xs.splice(0, this.xs.length - this.cap);
  }
  reset() { this.xs = []; }
  get values(): readonly number[] { return this.xs; }
  summary() { return summarize(this.xs); }
}
