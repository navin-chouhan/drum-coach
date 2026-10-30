// Mapping the app's Clock onto the UI thread. Pure TypeScript (Vitest-tested); useUiClock.ts runs it.
//
// The Clock (@drum-coach/core/platform) is a JS function (iOS: mach host ms from the MIDI module), which a Reanimated
// frame callback on the UI thread can't call. Both JS runtimes do have `performance.now()` on one shared base
// (std::chrono::steady_clock: React Native's JSExecutor and react-native-worklets' WorkletRuntimeDecorator), so the
// JS thread measures offset = Clock − performance.now() and the UI thread reads Clock ≈ performance.now() + offset.

/** One bracketed sample: performance.now() before, Clock, performance.now() after. */
export type OffsetSample = { before: number; clock: number; after: number };

/**
 * Clock − performance.now() from samples taken back to back: the tightest bracket wins (the least preempted read).
 * Returns NaN for no usable sample.
 */
export function estimateOffset(samples: readonly OffsetSample[]): number {
  let best = NaN, width = Infinity;
  for (const s of samples) {
    const w = s.after - s.before;
    if (!Number.isFinite(w) || w < 0 || !Number.isFinite(s.clock)) continue;
    if (w < width) {
      width = w;
      best = s.clock - (s.before + s.after) / 2;
    }
  }
  return best;
}

/** Takes `n` samples now (on the JS thread). */
export function sampleOffset(clockNow: () => number, perfNow: () => number, n = 5): number {
  const samples: OffsetSample[] = [];
  for (let i = 0; i < n; i++) {
    const before = perfNow(), clock = clockNow(), after = perfNow();
    samples.push({ before, clock, after });
  }
  return estimateOffset(samples);
}

/**
 * Smooths re-measured offsets: small changes (jitter) move it slowly, a jump (a new Clock, a resume after sleep) is
 * taken at once.
 */
export function nextOffset(previous: number, measured: number, jumpMs = 20, weight = 0.2): number {
  if (!Number.isFinite(measured)) return previous;
  if (!Number.isFinite(previous) || Math.abs(measured - previous) > jumpMs) return measured;
  return previous + (measured - previous) * weight;
}
