import { padMatches, type ChartDrum } from './chart.ts';
import type { PadId } from './kit.ts';
import type { Run } from './run.ts';

export const WINDOWS = { perfect: 40, good: 100, near: 250 }; // near: an off-time stroke still belongs to its note (a miss, not an extra)
/** Windows for a tempo: "near" grows with the beat (30% of it), so a slow-tempo slip isn't an extra; a hit on the & still is. */
export const windowsFor = (beatMs: number) => ({ ...WINDOWS, near: Math.max(WINDOWS.near, beatMs * 0.3) });
export type Judgement = 'perfect' | 'good' | 'miss';
/** time = ms on the performance.now() clock (latency already removed for hits). */
export type Expected = { time: number; drum: ChartDrum };
export type PlayedHit = { time: number; pad?: PadId; velocity: number };
export type Match = { index: number; offset: number; judgement: Judgement }; // 'miss' = claimed by an off-time stroke
export type NoteResult = { judgement: Judgement; offset?: number; velocity?: number; pad?: PadId; off?: number }; // off: ms of an off-time stroke (not a hit)

/** What a match means for its note: a hit with its offset, or a miss that remembers how far off the stroke was. */
export const toResult = (m: Match, velocity: number, pad?: PadId): NoteResult =>
  m.judgement === 'miss' ? { judgement: 'miss', off: m.offset } : { judgement: m.judgement, offset: m.offset, velocity, pad };

/**
 * Online matcher: each hit takes the nearest not-yet-matched expected note of a compatible drum
 * within the Good window. Failing that, a stroke within the Near window of its closest note of that drum
 * (if still open) is off time: the note stays a miss, but the stroke isn't an extra. Otherwise it's an
 * extra (returns null). `expected` must be sorted by time.
 */
export function createMatcher(expected: Expected[], w = WINDOWS) {
  const taken = new Uint8Array(expected.length);
  return (hit: PlayedHit): Match | null => {
    if (!hit.pad) return null;
    const from = (ms: number) => { let lo = 0, hi = expected.length; while (lo < hi) { const m = (lo + hi) >> 1; if (expected[m].time < hit.time - ms) lo = m + 1; else hi = m; } return lo; };
    const lo = from(w.good);
    let best = -1, bestAbs = Infinity;
    for (let k = lo; k < expected.length && expected[k].time <= hit.time + w.good; k++) {
      const a = Math.abs(hit.time - expected[k].time);
      if (!taken[k] && a < bestAbs && padMatches(expected[k].drum, hit.pad)) { best = k; bestAbs = a; }
    }
    if (best < 0) {
      let near = -1, nearAbs = Infinity;
      for (let k = from(w.near); k < expected.length && expected[k].time <= hit.time + w.near; k++) {
        const a = Math.abs(hit.time - expected[k].time);
        if (a <= w.near && a < nearAbs && padMatches(expected[k].drum, hit.pad)) { near = k; nearAbs = a; }
      }
      if (near < 0 || taken[near]) return null; // nothing close, or that note was already played: a real extra
      taken[near] = 1;
      return { index: near, offset: hit.time - expected[near].time, judgement: 'miss' };
    }
    taken[best] = 1;
    const offset = hit.time - expected[best].time;
    return { index: best, offset, judgement: Math.abs(offset) <= w.perfect ? 'perfect' : 'good' };
  };
}

/** Scores a whole run. Hits must be in time order and latency-corrected. */
export function scoreRun(expected: Expected[], hits: PlayedHit[]) {
  const match = createMatcher(expected);
  const results: NoteResult[] = expected.map(() => ({ judgement: 'miss' }));
  const extras: PlayedHit[] = [];
  for (const h of hits) {
    const m = match(h);
    if (m) results[m.index] = toResult(m, h.velocity);
    else extras.push(h);
  }
  return { results, extras };
}

/**
 * Almost every stroke (hits and off-time strokes) on the same side, by a lot: that's usually the latency setting,
 * not the hands. Returns the mean ms (+ late, − early), or null.
 */
export function latencySuspect(results: NoteResult[]): number | null {
  const offs = results.flatMap(r => (r.offset ?? r.off) === undefined ? [] : [(r.offset ?? r.off)!]);
  if (offs.length < 8) return null;
  const m = offs.reduce((s, x) => s + x, 0) / offs.length;
  const sameSide = offs.filter(x => Math.sign(x) === Math.sign(m)).length / offs.length;
  return Math.abs(m) >= 40 && sameSide >= 0.85 ? Math.round(m) : null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const std = (xs: number[]) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(mean(xs.map(x => (x - m) ** 2))) : 0; };
const r1 = (x: number) => Math.round(x * 10) / 10;

export type DrumStats = { total: number; hit: number; accuracy: number; meanOffset: number };
export type HeatCell = { total: number; miss: number; meanAbsOffset: number };
export type RunStats = {
  total: number; perfect: number; good: number; miss: number; extra: number;
  accuracy: number;   // % of notes hit within the Good window
  meanOffset: number; // ms; negative = rushing, positive = dragging
  spread: number;     // ms standard deviation of offsets (consistency)
  perDrum: Partial<Record<ChartDrum, DrumStats>>;
  velocity: { normalMean: number; normalCv: number; accentMean: number | null; ghostMean: number | null };
  heat: HeatCell[];   // one cell per 16th position in the bar
};

export function computeStats(run: Run, results: NoteResult[], extra: number): RunStats {
  const hitOffsets = results.flatMap(r => (r.offset === undefined ? [] : [r.offset]));
  const count = (j: Judgement) => results.filter(r => r.judgement === j).length;
  const pct = (a: number, b: number) => (b ? r1((a / b) * 100) : 0);

  const perDrum: RunStats['perDrum'] = {};
  run.notes.forEach((n, i) => {
    const d = (perDrum[n.drum] ??= { total: 0, hit: 0, accuracy: 0, meanOffset: 0 });
    d.total++;
    if (results[i].offset !== undefined) { d.hit++; d.meanOffset += results[i].offset!; }
  });
  for (const d of Object.values(perDrum)) { d.meanOffset = d.hit ? r1(d.meanOffset / d.hit) : 0; d.accuracy = pct(d.hit, d.total); }

  const vel = (f: (n: Run['notes'][number]) => boolean) =>
    run.notes.flatMap((n, i) => (f(n) && results[i].velocity !== undefined ? [results[i].velocity!] : []));
  const normal = vel(n => !n.accent && !n.ghost), accents = vel(n => !!n.accent), ghosts = vel(n => !!n.ghost);

  const slots = Math.round(run.beatsPerBar * 4);
  const heat: HeatCell[] = Array.from({ length: slots }, () => ({ total: 0, miss: 0, meanAbsOffset: 0 }));
  const absSum = new Array(slots).fill(0), absN = new Array(slots).fill(0);
  run.notes.forEach((n, i) => {
    const s = Math.round(n.pos * 4) % slots, c = heat[s];
    c.total++;
    if (results[i].offset === undefined) c.miss++;
    else { absSum[s] += Math.abs(results[i].offset!); absN[s]++; }
  });
  heat.forEach((c, s) => { c.meanAbsOffset = absN[s] ? r1(absSum[s] / absN[s]) : 0; });

  return {
    total: results.length, perfect: count('perfect'), good: count('good'), miss: count('miss'), extra,
    accuracy: pct(hitOffsets.length, results.length),
    meanOffset: r1(mean(hitOffsets)), spread: r1(std(hitOffsets)), perDrum,
    velocity: {
      normalMean: r1(mean(normal)), normalCv: normal.length ? r1((std(normal) / mean(normal)) * 100) : 0,
      accentMean: accents.length ? r1(mean(accents)) : null, ghostMean: ghosts.length ? r1(mean(ghosts)) : null,
    },
    heat,
  };
}

/** Median offset of taps against the nearest click (taps more than 200 ms off are ignored). Null if fewer than 6 usable taps. */
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
