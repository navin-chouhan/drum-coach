import type { ChartDrum, ChartNote } from './chart.ts';

// Drum-hit detection from band levels (kick / snare / hi-hat). Rough by design: suggestions are
// confirmed by repetition across loop passes (`consensus`) and then by the student's ear.

export const BANDS = ['kick', 'snare', 'hihat'] as const satisfies readonly ChartDrum[];
export type Band = (typeof BANDS)[number];
export type Onset = { time: number; band: Band; strength: number }; // time in the frames' clock (s), strength in dB above the background

type BandCfg = { riseDb: number; floorDb: number; refractory: number; sustainFrames: number };
const CFG: Record<Band, BandCfg> = {
  kick: { riseDb: 7, floorDb: -55, refractory: 0.09, sustainFrames: 0 },
  // a snare rings 50+ ms; a closed hi-hat (12 ms) or a kick's beater click leaking into this band dies away first
  snare: { riseDb: 6, floorDb: -55, refractory: 0.08, sustainFrames: 4 },
  hihat: { riseDb: 6, floorDb: -65, refractory: 0.05, sustainFrames: 0 },
};
const SUSTAIN_DROP_DB = 10; // a sustained hit stays within this of its peak while it's being confirmed
const FAST_FRAMES = 3; // the rise must happen within ~3 frames (~16 ms): drums, not a swelling bass note or pad

/**
 * Streaming detector. Feed one frame of RMS levels per band (same order as BANDS) with its start time.
 * An onset is a frame that is `riseDb` above the slow background (~150 ms average), got there fast, and
 * (for the snare) stays within 10 dB of its peak for ~20 ms. Onsets are reported at the frame where they started.
 */
export function createOnsetDetector(frameSec: number) {
  const slowK = Math.exp(-frameSec / 0.15);
  const state = BANDS.map(() => ({ bg: NaN, hist: [] as number[], last: -Infinity, armed: true, pending: null as null | { time: number; rise: number; peak: number; left: number } }));
  return (levels: readonly number[], time: number): Onset[] => {
    const out: Onset[] = [];
    BANDS.forEach((band, i) => {
      const s = state[i], c = CFG[band];
      const db = 20 * Math.log10((levels[i] ?? 0) + 1e-9);
      if (Number.isNaN(s.bg)) { s.bg = db; s.hist = [db]; return; } // first frame seeds the background
      if (s.pending) { // confirm a sustained hit, or drop a click
        s.pending.peak = Math.max(s.pending.peak, db);
        if (db < s.pending.peak - SUSTAIN_DROP_DB) s.pending = null;
        else if (--s.pending.left <= 0) { out.push({ time: s.pending.time, band, strength: s.pending.rise }); s.pending = null; }
      }
      const rise = db - s.bg, fast = db - s.hist[0];
      if (s.armed && rise >= c.riseDb && fast >= c.riseDb * 0.6 && db > c.floorDb && db > s.hist[s.hist.length - 1] && time - s.last >= c.refractory) {
        const hit = { time, rise: Math.round(rise * 10) / 10, peak: db, left: c.sustainFrames };
        if (c.sustainFrames) s.pending = hit; else out.push({ time, band, strength: hit.rise });
        s.last = time; s.armed = false;
      }
      if (rise < c.riseDb / 2) s.armed = true; // re-arm once the level has settled
      s.bg = slowK * s.bg + (1 - slowK) * db;
      s.hist.push(db);
      if (s.hist.length > FAST_FRAMES) s.hist.shift();
    });
    return out;
  };
}

/** Quantizes one pass's onsets (already in song beats) to the grid inside [from, to). */
export function onsetsToNotes(onsets: { beat: number; band: Band }[], from: number, to: number, stepsPerBeat = 4): ChartNote[] {
  const seen = new Set<string>(), out: ChartNote[] = [];
  for (const o of onsets) {
    const t = Math.round(o.beat * stepsPerBeat) / stepsPerBeat;
    if (t < from || t >= to || seen.has(`${t}:${o.band}`)) continue;
    seen.add(`${t}:${o.band}`);
    out.push({ t, drum: o.band });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Notes found in at least `min` passes (default: 2, or 1 when there's only one pass). */
export function consensus(passes: ChartNote[][], min = passes.length > 1 ? 2 : 1): (ChartNote & { votes: number })[] {
  const votes = new Map<string, ChartNote & { votes: number }>();
  for (const pass of passes) for (const n of pass) {
    const k = `${n.t}:${n.drum}`;
    const v = votes.get(k);
    if (v) v.votes++; else votes.set(k, { t: n.t, drum: n.drum, votes: 1 });
  }
  return [...votes.values()].filter(v => v.votes >= min).sort((a, b) => a.t - b.t);
}
