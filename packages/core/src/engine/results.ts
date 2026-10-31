import { latencySuspect } from './scoring.ts';

// The words and the heat-map colour of a take's details (the web's src/play/Results.tsx, the iPad's ResultsDetails).
// Moved here so both use one copy.

/** The mean offset in words: on the grid, rushing or dragging. */
export const timingText = (ms: number) => (Math.abs(ms) < 5 ? 'Right on the grid' : ms < 0 ? `Rushing by ${Math.round(-ms)} ms` : `Dragging by ${Math.round(ms)} ms`);

/** How bad a heat-map cell is, 0 (solid) … 1 (missed or off-time): misses count 1.6×, 60 ms average error counts 0.8. */
export function heatBad(c: { total: number; miss: number; meanAbsOffset: number }): number {
  const miss = c.total ? c.miss / c.total : 0, err = Math.min(1, c.meanAbsOffset / 60);
  return Math.min(1, miss * 1.6 + err * 0.8);
}

/** Where the latency test is on the web; the iPad passes LATENCY_PATH_IPAD. */
export const LATENCY_PATH_WEB = '⚙ Setup → Your kit';
export const LATENCY_PATH_IPAD = '⚙ Setup → Latency → Measure';

/**
 * Every stroke off by the same amount: point at the latency test before the student blames their hands. `where` is
 * the app's path to the test (the web's by default).
 */
export function latencyLine(f: { options: { wait?: boolean }; results: Parameters<typeof latencySuspect>[0] }, where = LATENCY_PATH_WEB): string | undefined {
  const ms = f.options.wait ? null : latencySuspect(f.results);
  return ms === null ? undefined : `Almost every stroke landed about ${Math.abs(ms)} ms ${ms > 0 ? 'late' : 'early'}. If it felt on time to you, it's probably the setup, not your hands: run the latency test under ${where}.`;
}
