// Copied from src/engine/scoring.ts (estimateLatency with its mean/std/r1 helpers) and src/ui/LatencyCard.tsx (its
// constants and tap window) for Gate 0; moves to @drum-coach/core in A1. Semantics unchanged. tapTestResult adds the
// mean of the same offsets for the Gate 0 report; the web app's number is estimateLatency's median `latencyMs`.

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(mean(xs.map(x => (x - m) ** 2))) : 0; };
const r1 = (x: number) => Math.round(x * 10) / 10;

export function estimateLatency(clicks: number[], taps: number[]): { latencyMs: number; spread: number; n: number } | null {
  const diffs = taps.flatMap(t => {
    const d = clicks.reduce((best, c) => (Math.abs(t - c) < Math.abs(best) ? t - c : best), Infinity);
    return Math.abs(d) <= 200 ? [d] : [];
  }).sort((a, b) => a - b);
  if (diffs.length < 6) return null;
  const mid = diffs.length >> 1;
  const median = diffs.length % 2 ? diffs[mid] : (diffs[mid - 1] + diffs[mid]) / 2;
  return { latencyMs: Math.round(median), spread: r1(std(diffs)), n: diffs.length };
}

// LatencyCard: fewer or more scattered taps measure the player, not the latency.
export const MAX_SPREAD = 50, MIN_TAPS = 10;
/** LatencyCard keeps a hit when h.time > clicks[0] - 300. */
export const TAP_WINDOW_BEFORE_MS = 300;

/** Gate 0: 120 BPM, a 4-click count-in, then 32 clicks to tap on the snare (the web card: 60 BPM, 4 + 16). */
export const TAP_TEST = { bpm: 120, countIn: 4, clicks: 32 } as const;

export type TapTestResult = {
  /** The web app's number: median offset of taps from the nearest heard click, ms (+ = late). */
  latencyMs: number;
  meanMs: number;
  spread: number;
  n: number;
  trusted: boolean;
} | null;

/** estimateLatency plus the mean of the same offsets (taps within ±200 ms of a click). */
export function tapTestResult(clicks: number[], taps: number[]): TapTestResult {
  const est = estimateLatency(clicks, taps);
  if (!est) return null;
  const diffs = taps.flatMap(t => {
    const d = clicks.reduce((best, c) => (Math.abs(t - c) < Math.abs(best) ? t - c : best), Infinity);
    return Math.abs(d) <= 200 ? [d] : [];
  });
  return { ...est, meanMs: r1(mean(diffs)), trusted: est.spread <= MAX_SPREAD && est.n >= MIN_TAPS };
}

/** Taps the web card would keep: those after the first scored click minus 300 ms. */
export const keepTaps = (clicks: number[], hits: number[]) => (clicks.length ? hits.filter(t => t > clicks[0] - TAP_WINDOW_BEFORE_MS) : []);
