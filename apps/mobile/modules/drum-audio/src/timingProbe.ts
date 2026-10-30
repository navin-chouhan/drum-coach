// T6-8 (AUDIO-DESIGN §7.1): clicks scheduled on host time vs the onsets native finds in the main mixer's output.
// Pure: native records the two lists (stopTimingProbe), this matches and summarises them.

export type TimingSummary = {
  /** Scheduled clicks with an onset within ±maxDistMs. */
  matched: number;
  /** Scheduled clicks with no onset near them (dropped, or the tap missed them). */
  unmatchedScheduled: number;
  /** Onsets with no scheduled click near them. */
  unmatchedOnsets: number;
  /** The constant offset (mean of onset − scheduled), ms. */
  meanMs: number;
  /** After removing the mean: the 99th percentile of |error|, ms. Pass < 0.5. */
  p99AbsMs: number;
  maxAbsMs: number;
  /** Least-squares slope of the error over time, in ms per 5 minutes. Pass < 1. */
  slopeMsPer5Min: number;
  /** First to last matched click, s. */
  spanS: number;
};

/** Pairs each scheduled time with the nearest onset within ±maxDistMs (both lists in any order). */
export function matchOnsets(scheduledMs: readonly number[], onsetsMs: readonly number[], maxDistMs = 20): { at: number; err: number }[] {
  const on = [...onsetsMs].sort((a, b) => a - b);
  const used = new Set<number>();
  const pairs: { at: number; err: number }[] = [];
  for (const s of [...scheduledMs].sort((a, b) => a - b)) {
    // binary search for the first onset ≥ s − maxDist
    let lo = 0, hi = on.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (on[mid] < s - maxDistMs) lo = mid + 1;
      else hi = mid;
    }
    let best = -1;
    for (let j = lo; j < on.length && on[j] <= s + maxDistMs; j++) {
      if (used.has(j)) continue;
      if (best < 0 || Math.abs(on[j] - s) < Math.abs(on[best] - s)) best = j;
    }
    if (best >= 0) {
      used.add(best);
      pairs.push({ at: s, err: on[best] - s });
    }
  }
  return pairs;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i];
}

export function summarizeTiming(scheduledMs: readonly number[], onsetsMs: readonly number[], maxDistMs = 20): TimingSummary {
  const pairs = matchOnsets(scheduledMs, onsetsMs, maxDistMs);
  const n = pairs.length;
  const base = {
    matched: n,
    unmatchedScheduled: scheduledMs.length - n,
    unmatchedOnsets: onsetsMs.length - n,
  };
  if (n === 0) return { ...base, meanMs: 0, p99AbsMs: 0, maxAbsMs: 0, slopeMsPer5Min: 0, spanS: 0 };
  const meanMs = pairs.reduce((s, p) => s + p.err, 0) / n;
  const abs = pairs.map(p => Math.abs(p.err - meanMs)).sort((a, b) => a - b);
  // slope of err over time, centred on the first click so 1e9 ms clocks don't lose precision
  const t0 = pairs[0].at;
  const mt = pairs.reduce((s, p) => s + (p.at - t0), 0) / n;
  let num = 0, den = 0;
  for (const p of pairs) {
    num += (p.at - t0 - mt) * (p.err - meanMs);
    den += (p.at - t0 - mt) ** 2;
  }
  const slope = den > 0 ? num / den : 0; // ms per ms
  return {
    ...base,
    meanMs,
    p99AbsMs: percentile(abs, 0.99),
    maxAbsMs: abs[abs.length - 1],
    slopeMsPer5Min: slope * 300_000,
    spanS: (pairs[n - 1].at - t0) / 1000,
  };
}
