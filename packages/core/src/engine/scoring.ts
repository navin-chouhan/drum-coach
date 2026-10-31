import { padMatches, type ChartDrum } from './chart.ts';
import type { PadId } from './kit.ts';
import type { Run } from './run.ts';
import { barDynamics, swingPct } from './feel.ts';

export const WINDOWS = { perfect: 40, good: 100, near: 250 }; // near: an off-time stroke still belongs to its note (a miss, not an extra)
/**
 * Windows for a tempo: "near" grows with the beat (30% of it), so a slow-tempo slip isn't an extra; a hit on the & still is.
 * Fast notes shrink Good to 40% of the closest gap between two notes on one drum (`gapMs`), so a 16th can't be "good" halfway to the next one.
 */
export function windowsFor(beatMs: number, gapMs = Infinity, goodMs = WINDOWS.good) {
  const good = Math.min(goodMs, Math.round(gapMs * 0.4));
  return { good, perfect: Math.min(WINDOWS.perfect, Math.round(good / 2)), near: Math.max(WINDOWS.near, beatMs * 0.3) };
}
export type Judgement = 'perfect' | 'good' | 'miss';
/** time = host ms on the app's one Clock (web: performance.now()); latency already removed for hits. */
export type Expected = { time: number; drum: ChartDrum; good?: number; grace?: number; buzz?: boolean }; // buzz: a buzz (press) stroke, its bounces belong to it // good: this note's own Good window (noteWindows); grace: chart grace strokes
/**
 * Per-note Good windows: 40% of the gap to the nearest note on the same drum, capped at `goodMs`. Fast 16ths on the
 * snare are judged tighter without shrinking the 8ths on the hi-hat beside them (a take-wide window did).
 * `expected` must be sorted by time.
 */
export function noteWindows(expected: Expected[], goodMs = WINDOWS.good): Expected[] {
  const gap = expected.map(() => Infinity), last = new Map<ChartDrum, number>();
  expected.forEach((e, i) => {
    const p = last.get(e.drum);
    if (p !== undefined && e.time - expected[p].time > 1e-6) { const g = e.time - expected[p].time; gap[i] = Math.min(gap[i], g); gap[p] = Math.min(gap[p], g); }
    last.set(e.drum, i);
  });
  return expected.map((e, i) => ({ ...e, good: Math.min(goodMs, Math.round(gap[i] * 0.4)) }));
}
export type PlayedHit = { time: number; pad?: PadId; velocity: number };
/** How a grace note came out: grace strokes before the main one, first stroke → main stroke ms, first / main velocity. */
export type GraceResult = { strokes: number; gapMs: number; ratio: number };
export type Match = { index: number; offset: number; judgement: Judgement; grace?: GraceResult; bounce?: boolean }; // 'miss' = claimed by an off-time stroke; bounce = part of a buzz note, neither a hit nor an extra
export type NoteResult = { judgement: Judgement; offset?: number; velocity?: number; pad?: PadId; off?: number; grace?: GraceResult }; // off: ms of an off-time stroke (not a hit)

/** What a match means for its note: a hit with its offset, or a miss that remembers how far off the stroke was. */
export const toResult = (m: Match, velocity: number, pad?: PadId): NoteResult => ({
  ...(m.judgement === 'miss' ? { judgement: 'miss', off: m.offset } : { judgement: m.judgement, offset: m.offset, velocity, pad }),
  ...(m.grace && { grace: m.grace }),
});

// Grace chain: a later stroke on the same pad within GRACE_STEP_MS, at least GRACE_VEL × the stroke before it, takes a
// grace note over (the grace stroke came first, the main stroke counts). A softer stroke is a bounce, not the main one.
const BUZZ_MAX_MS = 400; // a buzz stroke rings this long at most
const GRACE_STEP_MS = 60, GRACE_SPAN_MS = 120, GRACE_MAX_MOVES = 3, GRACE_VEL = 0.9;

/**
 * Online matcher: each hit takes the nearest not-yet-matched expected note of a compatible drum
 * within the Good window. Failing that, a stroke within the Near window of a note of that drum is off time
 * (the latest open note before it, else the closest after it): the note stays a miss, but the stroke isn't
 * an extra. A stroke whose closest note was already played is an extra (returns null). `expected` must be sorted by time.
 */
export function createMatcher(expected: Expected[], w = WINDOWS) {
  const taken = new Uint8Array(expected.length);
  // grace notes: the strokes that claimed each one so far
  const chain = new Map<number, { first: number; firstVel: number; last: number; lastVel: number; moves: number }>();
  const judge = (k: number, offset: number): Judgement => {
    const good = expected[k].good ?? w.good;
    return Math.abs(offset) > good ? 'miss' : Math.abs(offset) <= Math.min(w.perfect, Math.round(good / 2)) ? 'perfect' : 'good';
  };
  const claim = (k: number, hit: PlayedHit, m: Match): Match => {
    if (expected[k].grace) chain.set(k, { first: hit.time, firstVel: hit.velocity, last: hit.time, lastVel: hit.velocity, moves: 0 });
    return expected[k].grace ? { ...m, grace: { strokes: 0, gapMs: 0, ratio: 1 } } : m;
  };
  return (hit: PlayedHit): Match | null => {
    if (!hit.pad) return null;
    const from = (ms: number) => { let lo = 0, hi = expected.length; while (lo < hi) { const m = (lo + hi) >> 1; if (expected[m].time < hit.time - ms) lo = m + 1; else hi = m; } return lo; };
    // an open note on this pad nearer to the stroke than note k: the stroke is that note's, not k's main stroke
    const nearerOpen = (k: number) => { const d = Math.abs(hit.time - expected[k].time);
      for (let j = from(d); j < expected.length && expected[j].time < hit.time + d; j++) if (j !== k && !taken[j] && padMatches(expected[j].drum, hit.pad!)) return true;
      return false; };
    // The main stroke of a grace note already claimed by its grace stroke(s)?
    for (const [k, c] of chain) {
      if (hit.time - c.first > GRACE_SPAN_MS) { chain.delete(k); continue; }
      if (c.moves < GRACE_MAX_MOVES && hit.time - c.last <= GRACE_STEP_MS && hit.velocity >= c.lastVel * GRACE_VEL && padMatches(expected[k].drum, hit.pad)
        && !nearerOpen(k)) {
        Object.assign(c, { last: hit.time, lastVel: hit.velocity, moves: c.moves + 1 });
        const offset = hit.time - expected[k].time;
        return { index: k, offset, judgement: judge(k, offset), grace: { strokes: c.moves, gapMs: Math.round(hit.time - c.first), ratio: Math.round((c.firstVel / hit.velocity) * 100) / 100 } };
      }
    }
    const lo = from(w.good);
    let best = -1, bestAbs = Infinity;
    for (let k = lo; k < expected.length && expected[k].time <= hit.time + w.good; k++) {
      const a = Math.abs(hit.time - expected[k].time);
      if (!taken[k] && a < bestAbs && a <= (expected[k].good ?? w.good) && padMatches(expected[k].drum, hit.pad)) { best = k; bestAbs = a; }
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
      // a bounce of a buzz stroke: same pad, after a played buzz note and before the next note on that pad
      // shortcut: two linear scans per stray stroke; fine for lesson-size charts, index notes by pad if songs get buzz notes
      const buzz = expected.findLastIndex((e, j) => taken[j] && e.buzz && e.time <= hit.time && padMatches(e.drum, hit.pad!));
      if (buzz >= 0 && !expected.some((e, j) => j > buzz && e.time <= hit.time - 1e-6 && padMatches(e.drum, hit.pad!)) && hit.time - expected[buzz].time < BUZZ_MAX_MS)
        return { index: buzz, offset: 0, judgement: 'miss', bounce: true };
      if (near < 0 || taken[near]) return null; // nothing close, or that note was already played: a real extra
      const idx = past >= 0 ? past : near;
      taken[idx] = 1;
      return claim(idx, hit, { index: idx, offset: hit.time - expected[idx].time, judgement: 'miss' });
    }
    taken[best] = 1;
    const offset = hit.time - expected[best].time;
    return claim(best, hit, { index: best, offset, judgement: judge(best, offset) });
  };
}

/** Scores a whole run. Hits must be in time order and latency-corrected. */
export function scoreRun(expected: Expected[], hits: PlayedHit[]) {
  const match = createMatcher(expected);
  const results: NoteResult[] = expected.map(() => ({ judgement: 'miss' }));
  const extras: PlayedHit[] = [];
  for (const h of hits) {
    const m = match(h);
    if (m?.bounce) continue; // part of a buzz note
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
  grace?: { notes: number; played: number; pct: number; gapMs: number; ratio: number } | null; // grace notes: how many came out as grace + main
  feel?: { swing: number | null; dynamics: number | null }; // engine/feel.ts: swing %, volume following the marks (when the player gives the tempo)
  heat: HeatCell[];   // one cell per grid position in the bar: 16ths, or triplets for a triplet groove (heatSlotName)
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

/** Flow mode's live line: % of the notes between two beats of the run that landed (null when none are due yet). */
export function recentAccuracy(results: NoteResult[], run: Run, fromBeat: number, toBeat: number): number | null {
  const due = run.notes.flatMap((n, i) => (n.t >= fromBeat && n.t < toBeat ? [results[i]] : []));
  return due.length ? Math.round((due.filter(r => r.offset !== undefined).length / due.length) * 100) : null;
}

/** Beat the clock: bars with no missed note and no extra hit (extras given in beats of the run). */
export function cleanBars(run: Run, results: NoteResult[], extraBeats: number[]): number {
  const bars = Math.round(run.beats / run.beatsPerBar);
  const bad = new Set([...run.notes.flatMap((n, i) => (results[i].offset === undefined ? [n.bar] : [])), ...extraBeats.map(b => Math.floor(b / run.beatsPerBar))]);
  return Array.from({ length: bars }, (_, b) => b).filter(b => !bad.has(b)).length;
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

/** Heat-map cells per beat: 4 (16ths) when every note sits on the 16th grid, 3 for a triplet groove, 12 for both. */
function heatGrid(pos: number[]): number {
  const fits = (k: number) => pos.every(p => Math.abs(p * k - Math.round(p * k)) < 1e-3);
  return fits(4) ? 4 : fits(3) ? 3 : 12;
}
const COUNT_NAMES: Record<number, string[]> = { 4: ['', 'e', '&', 'a'], 3: ['', 'trip', 'let'] };
/** A heat cell's name, e.g. "beat 2 &" (16ths) or "beat 2 let" (triplets). */
export function heatSlotName(i: number, slots: number, beatsPerBar: number): string {
  const perBeat = Math.round(slots / beatsPerBar), k = i % perBeat, name = COUNT_NAMES[perBeat]?.[k] ?? (k ? `+${k}/${perBeat}` : '');
  return `beat ${Math.floor(i / perBeat) + 1}${name ? ' ' + name : ''}`;
}

/** `beatMs` and `dyn` (the chart's 1–3 marks per run bar) add the feel: swing % and dynamics (R4). */
export function computeStats(run: Run, results: NoteResult[], extra: number, beatMs?: number, dyn?: (number | undefined)[]): RunStats {
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
    run.notes.flatMap((n, i) => (f(n) && results[i].velocity !== undefined ? [results[i].velocity] : []));
  const normal = vel(n => !n.accent && !n.ghost), accents = vel(n => !!n.accent), ghosts = vel(n => !!n.ghost);

  const perBeat = heatGrid(run.notes.map(n => n.pos)), slots = Math.round(run.beatsPerBar * perBeat);
  const heat: HeatCell[] = Array.from({ length: slots }, () => ({ total: 0, miss: 0, meanAbsOffset: 0 }));
  const absSum = new Array(slots).fill(0), absN = new Array(slots).fill(0);
  run.notes.forEach((n, i) => {
    const s = Math.round(n.pos * perBeat) % slots, c = heat[s];
    c.total++;
    if (results[i].offset === undefined) c.miss++;
    else { absSum[s] += Math.abs(results[i].offset); absN[s]++; }
  });
  heat.forEach((c, s) => { c.meanAbsOffset = absN[s] ? r1(absSum[s] / absN[s]) : 0; });

  // Pairs by position (a missed note doesn't shift the pairing); only pairs with both notes played count.
  const plain = run.notes.flatMap((n, i) => (!n.accent && !n.ghost ? [results[i].velocity] : []));
  const pairs = plain.flatMap((v, i) => (i % 2 === 0 && v !== undefined && plain[i + 1] !== undefined ? [[v, plain[i + 1]!]] : []));
  const pairDrop = pairs.length >= 4 ? r1(((mean(pairs.map(p => p[0])) - mean(pairs.map(p => p[1]))) / mean(pairs.map(p => p[0]))) * 100) : null;

  const together = new Map<number, number[]>(); // t → offsets of the notes played there
  run.notes.forEach((n, i) => { if (results[i].offset !== undefined) together.set(n.t, [...(together.get(n.t) ?? []), results[i].offset]); });
  const splits = [...together.values()].filter(o => o.length > 1).map(o => Math.max(...o) - Math.min(...o));

  const graceNotes = run.notes.flatMap((n, i) => (n.grace ? [results[i]] : []));
  const played = graceNotes.filter(r => r.offset !== undefined && (r.grace?.strokes ?? 0) > 0);
  const grace = graceNotes.length ? { notes: graceNotes.length, played: played.length, pct: pct(played.length, graceNotes.length),
    gapMs: r1(mean(played.map(r => r.grace!.gapMs))), ratio: Math.round(mean(played.map(r => r.grace!.ratio)) * 100) / 100 } : null;

  const feel = beatMs ? { swing: swingPct(run, results, beatMs), dynamics: dyn?.some(d => d !== undefined) ? barDynamics(run, results, dyn) : null } : undefined;

  return {
    ...(feel && { feel }), grace, total: results.length, perfect: count('perfect'), good: count('good'), miss: count('miss'), extra,
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

/** Taps further than this from every click aren't playing along with it. */
export const LATENCY_WINDOW_MS = 200;

const medianOf = (sorted: number[]) => {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Each click's offset: the tap closest to it within ±LATENCY_WINDOW_MS, one per click. A second tap on the same click
 * (a double hit, a flam, a pad retrigger the bounce filter let through) is the same stroke, not another measurement:
 * counting it pulled the spread up and gave more taps than clicks (17 of 16 on the iPad's first run).
 */
export function latencyOffsets(clicks: readonly number[], taps: readonly number[]): number[] {
  const best = new Map<number, number>();
  for (const t of taps) {
    let k = -1, d = Infinity;
    clicks.forEach((c, i) => { if (Math.abs(t - c) < Math.abs(d)) { d = t - c; k = i; } });
    if (k < 0 || Math.abs(d) > LATENCY_WINDOW_MS) continue;
    const prev = best.get(k);
    if (prev === undefined || Math.abs(d) < Math.abs(prev)) best.set(k, d);
  }
  return [...best.values()].sort((a, b) => a - b);
}

/**
 * Median offset of the taps against their clicks (latencyOffsets: one per click, ±200 ms). Null if fewer than 6.
 * `spread` is how steady they were, robustly: 1.4826 × the median absolute deviation (the standard deviation for
 * normally spread taps, but one stray tap 190 ms off no longer makes a steady player "not steady enough").
 */
export function estimateLatency(clicks: readonly number[], taps: readonly number[]): { latencyMs: number; spread: number; n: number } | null {
  const diffs = latencyOffsets(clicks, taps);
  if (diffs.length < 6) return null;
  const median = medianOf(diffs);
  const mad = medianOf(diffs.map(d => Math.abs(d - median)).sort((a, b) => a - b));
  return { latencyMs: Math.round(median), spread: r1(1.4826 * mad), n: diffs.length };
}
