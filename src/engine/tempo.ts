/** Beat grid of one recording: beat 0 (a downbeat) is at offsetSec in the video. */
export type BeatGrid = { bpm: number; offsetSec: number };

export const songSecAt = (beat: number, g: BeatGrid) => g.offsetSec + (beat * 60) / g.bpm;
export const beatAt = (songSec: number, g: BeatGrid) => ((songSec - g.offsetSec) * g.bpm) / 60;

/** Phase only, for a known tempo (e.g. the same song's other version): needs ≥ 2 taps on the beat, first on a 1. */
export function alignPhase(taps: number[], bpm: number, beatsPerBar = 4): BeatGrid | null {
  if (taps.length < 2) return null;
  const t = [...taps].sort((a, b) => a - b), period = 60 / bpm;
  const offset = t.reduce((a, x) => a + (x - Math.round((x - t[0]) / period) * period), 0) / t.length;
  const bar = period * beatsPerBar;
  return { bpm, offsetSec: Math.round((offset - Math.floor(offset / bar) * bar) * 1000) / 1000 };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * Least-squares beat grid from taps on the beat (first tap = a downbeat). Tolerates a skipped beat.
 * Beat 0 is moved back by whole bars to the first downbeat at or after 0 s, so the bar phase is kept.
 */
export function fitBeatGrid(taps: number[], beatsPerBar = 4): (BeatGrid & { residualMs: number }) | null {
  if (taps.length < 4) return null;
  const t = [...taps].sort((a, b) => a - b);
  let period = median(t.slice(1).map((x, i) => x - t[i]));
  if (!(period > 0.2 && period < 2)) return null; // 30–300 BPM
  let offset = t[0];
  for (let pass = 0; pass < 2; pass++) {
    const k = t.map(x => Math.round((x - offset) / period));
    const n = t.length, mk = k.reduce((a, b) => a + b, 0) / n, mt = t.reduce((a, b) => a + b, 0) / n;
    const sxx = k.reduce((a, ki) => a + (ki - mk) ** 2, 0);
    if (!sxx) return null;
    period = k.reduce((a, ki, i) => a + (ki - mk) * (t[i] - mt), 0) / sxx;
    offset = mt - period * mk;
  }
  const residualMs = Math.sqrt(t.reduce((a, x) => a + (x - offset - Math.round((x - offset) / period) * period) ** 2, 0) / t.length) * 1000;
  const bar = period * beatsPerBar;
  offset -= Math.floor(offset / bar) * bar;
  return { bpm: Math.round((60 / period) * 100) / 100, offsetSec: Math.round(offset * 1000) / 1000, residualMs: Math.round(residualMs * 10) / 10 };
}
