import { padMatches, type ChartDrum } from './chart.ts';
import type { PadId } from './kit.ts';
import type { Run } from './run.ts';

export const WINDOWS = { perfect: 40, good: 100, near: 250 }; // near: an off-time stroke still belongs to its note (a miss, not an extra)
/**
 * Windows for a tempo: "near" grows with the beat (30% of it), so a slow-tempo slip isn't an extra; a hit on the & still is.
 * Fast notes shrink Good to 40% of the closest gap between two notes on one drum (`gapMs`), so a 16th can't be "good" halfway to the next one.
 */
export function windowsFor(beatMs: number, gapMs = Infinity, goodMs = WINDOWS.good) {
  const good = Math.min(goodMs, Math.round(gapMs * 0.4));
  return { good, perfect: Math.min(WINDOWS.perfect, Math.round(good / 2)), near: Math.max(WINDOWS.near, beatMs * 0.3) };
}
/** Closest gap, in beats, between two notes on the same drum (Infinity if none repeat). */
export function minGapBeats(notes: { t: number; drum: ChartDrum }[]) {
  const last = new Map<ChartDrum, number>();
  let gap = Infinity;
  for (const n of [...notes].sort((a, b) => a.t - b.t)) {
    const prev = last.get(n.drum);
    if (prev !== undefined && n.t - prev > 1e-6) gap = Math.min(gap, n.t - prev);
    last.set(n.drum, n.t);
  }
  return gap;
}
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
 * within the Good window. Failing that, a stroke within the Near window of a note of that drum is off time
 * (the latest open note before it, else the closest after it): the note stays a miss, but the stroke isn't
 * an extra. A stroke whose closest note was already played is an extra (returns null). `expected` must be sorted by time.
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
      // Strokes arrive in time order, so an open note behind the stroke can only be this stroke's: a late stroke
      // takes the note before it, not the nearer note after it (that one's own stroke is still to come, and
      // dragging would otherwise read as rushing).
      let near = -1, nearAbs = Infinity, past = -1;
      for (let k = from(w.near); k < expected.length && expected[k].time <= hit.time + w.near; k++) {
        const a = Math.abs(hit.time - expected[k].time);
        if (a > w.near || !padMatches(expected[k].drum, hit.pad)) continue;
        if (a < nearAbs) { near = k; nearAbs = a; }
        if (!taken[k] && expected[k].time <= hit.time) past = k;
      }
      if (near < 0 || taken[near]) return null; // nothing close, or that note was already played: a real extra
      const idx = past >= 0 ? past : near;
      taken[idx] = 1;
      return { index: idx, offset: hit.time - expected[idx].time, judgement: 'miss' };
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

/**
 * A player who waits for each click and then hits (reaction time, ~100–400 ms) lands near the *next* note of an
 * even pattern and scores well; mid-pattern the strokes look on time. The tell-tales are at the edges: the first
 * stroke comes a reaction time after the first note with nothing before it, and the latest stroke the same
 * reaction time after the latest note that has come up (a player who merely came in late plays the later notes
 * on their notes; a rusher played the first one). Works mid-take. Returns the reaction ms, or null. `expected` sorted.
 */
export function reactingToClick(expected: Expected[], hits: PlayedHit[]): number | null {
  if (hits.length < 8 || !expected.length) return null;
  const band = (x: number) => x >= 100 && x <= 400;
  const first = Math.min(...hits.map(h => h.time)), last = Math.max(...hits.map(h => h.time));
  const head = first - expected[0].time;
  if (!band(head)) return null;
  const passed = expected.filter(e => e.time <= last);
  const tail = last - passed[passed.length - 1].time;
  return band(tail) && Math.abs(head - tail) <= 100 ? Math.round((head + tail) / 2) : null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const std = (xs: number[]) => { const m = mean(xs); return xs.length > 1 ? Math.sqrt(mean(xs.map(x => (x - m) ** 2))) : 0; };
const r1 = (x: number) => Math.round(x * 10) / 10;

export type DrumStats = { total: number; hit: number; accuracy: number; meanOffset: number };
export type HeatCell = { total: number; miss: number; meanAbsOffset: number };
export type RunStats = {
  total: number; perfect: number; good: number; miss: number; extra: number;
  accuracy: number;   // % of notes hit within the Good window
  meanOffset: number; // ms; negative = rushing, positive = dragging (off-time strokes included)
  spread: number;     // ms standard deviation of offsets (consistency, off-time strokes included)
  perDrum: Partial<Record<ChartDrum, DrumStats>>;
  velocity: { normalMean: number; normalCv: number; accentMean: number | null; ghostMean: number | null;
    pairDrop: number | null }; // % the 2nd note of each pair (notes 1–2, 3–4…) is softer than the 1st: weak doubles
  flam: number | null; // ms, mean split between limbs on notes meant to land together (null: none played)
  heat: HeatCell[];   // one cell per 16th position in the bar
  streak: number;     // most notes hit in a row
  recoveries: number; // times a hit came straight after a miss: you kept going
  reaction?: number | null; // ms a player who hits after each click is behind (set by the player at the end of a take)
};

/**
 * The 1–2 bars where most notes were missed (1-based chart bars, repeats folded together), worst first; empty for a
 * one-bar section or a clean take. `fromBar` is the section's first chart bar, `sectionBars` its length.
 */
export function worstBars(run: Run, results: NoteResult[], sectionBars: number, fromBar = 1): number[] {
  if (sectionBars < 2) return [];
  const miss = new Array(sectionBars).fill(0), total = new Array(sectionBars).fill(0);
  run.notes.forEach((n, i) => { const b = n.bar % sectionBars; total[b]++; if (results[i].offset === undefined) miss[b]++; });
  return miss.map((m, b) => ({ b, m, rate: total[b] ? m / total[b] : 0 }))
    .filter(x => x.m >= 2 && x.rate >= 0.2).sort((x, y) => y.rate - x.rate || y.m - x.m).slice(0, 2).map(x => x.b + fromBar);
}

function streaks(results: NoteResult[]) {
  let streak = 0, run = 0, recoveries = 0;
  results.forEach((r, i) => {
    const hit = r.offset !== undefined;
    run = hit ? run + 1 : 0;
    streak = Math.max(streak, run);
    if (hit && i > 0 && results[i - 1].offset === undefined) recoveries++;
  });
  return { streak, recoveries };
}

export function computeStats(run: Run, results: NoteResult[], extra: number): RunStats {
  const hitOffsets = results.flatMap(r => (r.offset === undefined ? [] : [r.offset]));
  // Timing counts off-time strokes too: at fast tempos a dragging player's late strokes fall outside Good,
  // and leaving them out would report them as nearly on time.
  const timeOf = (r: NoteResult) => r.offset ?? r.off;
  const timing = results.flatMap(r => (timeOf(r) === undefined ? [] : [timeOf(r)!]));
  const count = (j: Judgement) => results.filter(r => r.judgement === j).length;
  const pct = (a: number, b: number) => (b ? r1((a / b) * 100) : 0);

  const perDrum: RunStats['perDrum'] = {}, timed = new Map<object, number>();
  run.notes.forEach((n, i) => {
    const d = (perDrum[n.drum] ??= { total: 0, hit: 0, accuracy: 0, meanOffset: 0 });
    d.total++;
    if (results[i].offset !== undefined) d.hit++;
    const t = timeOf(results[i]);
    if (t !== undefined) { timed.set(d, (timed.get(d) ?? 0) + 1); d.meanOffset += t; }
  });
  for (const d of Object.values(perDrum)) { const k = timed.get(d) ?? 0; d.meanOffset = k ? r1(d.meanOffset / k) : 0; d.accuracy = pct(d.hit, d.total); }

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

  // Pairs by position (a missed note doesn't shift the pairing); only pairs with both notes played count.
  const plain = run.notes.flatMap((n, i) => (!n.accent && !n.ghost ? [results[i].velocity] : []));
  const pairs = plain.flatMap((v, i) => (i % 2 === 0 && v !== undefined && plain[i + 1] !== undefined ? [[v, plain[i + 1]!]] : []));
  const pairDrop = pairs.length >= 4 ? r1(((mean(pairs.map(p => p[0])) - mean(pairs.map(p => p[1]))) / mean(pairs.map(p => p[0]))) * 100) : null;

  const together = new Map<number, number[]>(); // t → offsets of the notes played there
  run.notes.forEach((n, i) => { if (results[i].offset !== undefined) together.set(n.t, [...(together.get(n.t) ?? []), results[i].offset!]); });
  const splits = [...together.values()].filter(o => o.length > 1).map(o => Math.max(...o) - Math.min(...o));

  return {
    total: results.length, perfect: count('perfect'), good: count('good'), miss: count('miss'), extra,
    accuracy: pct(hitOffsets.length, results.length),
    meanOffset: r1(mean(timing)), spread: r1(std(timing)), perDrum,
    velocity: {
      normalMean: r1(mean(normal)), normalCv: normal.length ? r1((std(normal) / mean(normal)) * 100) : 0,
      accentMean: accents.length ? r1(mean(accents)) : null, ghostMean: ghosts.length ? r1(mean(ghosts)) : null, pairDrop,
    },
    flam: splits.length ? r1(mean(splits)) : null,
    heat, ...streaks(results),
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
