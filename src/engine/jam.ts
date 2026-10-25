import type { PadId } from './kit.ts';
import type { PlayedHit } from './scoring.ts';
import { WINDOWS } from './scoring.ts';
import { beatAt, songSecAt, type BeatGrid } from './tempo.ts';

export type JamHit = { songSec: number; pad: PadId; velocity: number };
export type JamStats = {
  hits: number; onGridPct: number; perfectPct: number;
  meanOffset: number; spread: number; // ms vs the nearest grid step; negative = rushing
  driftMsPerMin: number | null;       // trend of the offset over the song (speeding up = negative); null under 20 s of playing
  perDrum: Partial<Record<PadId, { hits: number; meanOffset: number; spread: number; velMean: number; velCv: number }>>;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(mean(xs.map(x => (x - m) ** 2))) : 0; };
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Chartless scoring against the song's beat grid: each hit is compared with the nearest step
 * (stepsPerBeat 2 = 8ths). `rate` = playback speed, so offsets are in real milliseconds.
 */
export function scoreJam(hits: JamHit[], grid: BeatGrid, stepsPerBeat = 2, rate = 1): JamStats {
  const offs = hits.map(h => {
    const step = Math.round(beatAt(h.songSec, grid) * stepsPerBeat) / stepsPerBeat;
    return ((h.songSec - songSecAt(step, grid)) * 1000) / rate;
  });
  const n = hits.length, pct = (k: number) => (n ? r1((k / n) * 100) : 0);
  const ms = mean(hits.map(h => h.songSec)), mo = mean(offs);
  const sxx = hits.reduce((a, h) => a + (h.songSec - ms) ** 2, 0);
  const slope = sxx ? hits.reduce((a, h, i) => a + (h.songSec - ms) * (offs[i] - mo), 0) / sxx : 0; // ms per song-second
  const perDrum: JamStats['perDrum'] = {};
  for (const pad of new Set(hits.map(h => h.pad))) {
    const idx = hits.flatMap((h, i) => (h.pad === pad ? [i] : []));
    const o = idx.map(i => offs[i]), v = idx.map(i => hits[i].velocity);
    perDrum[pad] = { hits: idx.length, meanOffset: r1(mean(o)), spread: r1(std(o)), velMean: r1(mean(v)), velCv: mean(v) ? r1((std(v) / mean(v)) * 100) : 0 };
  }
  return {
    hits: n, onGridPct: pct(offs.filter(o => Math.abs(o) <= WINDOWS.good).length),
    perfectPct: pct(offs.filter(o => Math.abs(o) <= WINDOWS.perfect).length),
    meanOffset: r1(mo), spread: r1(std(offs)), perDrum,
    // a few ms of jitter over a short jam would extrapolate to a big per-minute number
    driftMsPerMin: n && (hits[n - 1].songSec - hits[0].songSec) / rate >= 20 ? r1(slope * 60 * rate) : null,
  };
}

/**
 * Free bars (yours to fill, no chart notes): the hits in them, scored on the 8th-note grid of the take.
 * Bars are 1-based chart bars; `fromBar`/`sectionBars` describe the looped section. `extras` = how many of the take's
 * extra hits fell in free bars (they aren't mistakes there). Null when the take had no free bars.
 */
export function freeBarStats(hits: PlayedHit[], extras: PlayedHit[], take: { zero: number; beatMs: number; beatsPerBar: number; fromBar: number; sectionBars: number }, freeBars: number[]) {
  if (!freeBars.length) return null;
  const { zero, beatMs, beatsPerBar, fromBar, sectionBars } = take;
  const inFree = (h: PlayedHit) => { const b = Math.floor((h.time - zero) / beatMs / beatsPerBar); return b >= 0 && freeBars.includes((b % sectionBars) + fromBar); };
  const jam = hits.filter(inFree).map(h => ({ songSec: (h.time - zero) / 1000, pad: h.pad ?? 'snare', velocity: h.velocity }));
  return { stats: scoreJam(jam, { bpm: 60000 / beatMs, offsetSec: 0 }), extras: extras.filter(inFree).length };
}
