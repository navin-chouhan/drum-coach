import type { PadId } from './kit.ts';

// Fair hardware (N9): every pad reads stroke heights differently, and retriggers differently. A short calibration
// (soft strokes, then loud ones, per pad) maps each pad onto one scale and gives it its own retrigger filter.

export type PadCalibration = { soft: number; loud: number; bounceMs?: number; bounceRatio?: number };
export type KitCalibration = Partial<Record<PadId, PadCalibration>>;
const SOFT = 30, LOUD = 120;

/** A pad's raw velocity on the common scale (its soft → 30, its loud → 120), clamped to 1–127. None: unchanged. */
export function mapVelocity(v: number, cal?: Pick<PadCalibration, 'soft' | 'loud'>): number {
  if (!cal || cal.loud - cal.soft < 10) return v;
  return Math.max(1, Math.min(127, Math.round(SOFT + ((v - cal.soft) / (cal.loud - cal.soft)) * (LOUD - SOFT))));
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const RETRIGGER_MS = 80;
/**
 * From a pad's soft strokes and its loud strokes (every message, retriggers included, in time order): its soft and
 * loud (medians), and from the retriggers (a softer hit within 80 ms after a loud one) its own bounce window and ratio.
 */
export function measurePad(softs: number[], louds: { time: number; velocity: number }[]): PadCalibration {
  const main: { time: number; velocity: number }[] = [], gaps: number[] = [], ratios: number[] = [];
  for (const h of louds) {
    const prev = main[main.length - 1];
    if (prev && h.time - prev.time < RETRIGGER_MS && h.velocity < prev.velocity) { gaps.push(h.time - prev.time); ratios.push(h.velocity / prev.velocity); }
    else main.push(h);
  }
  return {
    soft: median(softs), loud: median(main.map(h => h.velocity)),
    ...(gaps.length && { bounceMs: Math.min(90, Math.max(...gaps) + 10), bounceRatio: Math.min(0.85, Math.round((Math.max(...ratios) + 0.1) * 100) / 100) }),
  };
}

/** Left-handed (N9): hand letters swapped, R ↔ L, grace hands too; feet (K, H) stay. */
export const mirrorHands = (s: string) => s.replace(/[RLrl]/g, c => ({ R: 'L', L: 'R', r: 'l', l: 'r' })[c]!);
