#!/usr/bin/env node
// T4 / M8: compares what the iPad heard with the web reference of the same fixture (reference/<fixture>.json).
//
//   node compare.mjs <results.json> --fixture emulated-ghost-groove [--exact | --tolerant] [--tol-ms 5] [--pair-ms 30] [--json]
//   node compare.mjs <results.json> --reference reference/emulated-ghost-groove.json
//
// Results it reads:
//   - the Gate 0 probe's "Copy results" JSON (kind "drum-coach-gate0-probe"): its noteLog (or lastLog) and counters.
//     Times are iPad host times, so the comparer finds the offset to beat 0 itself. The noteLog keeps the last 300
//     messages, so hits before its first entry are reported as outside the log, not as missing.
//   - the app's MIDI debug report ("Copy debug info" on /dev/midi, kind "drum-coach-midi-debug"): its `replay`, every
//     kit hit since Reset (the newest 5000) on the iPad's host clock, and its counters; aligned like the probe's.
//   - the app's take results (format TBD in Phase 2), for now: { fixture?, hits: [{ t | time, pad?, note?, velocity }],
//     timeBase?: "beat0" | "host", summary? } with times in ms after beat 0 unless timeBase is "host".
// Modes: exact (in-app replays: every hit, velocity and summary field must equal the reference, times within
// 0.001 ms) and tolerant (Network MIDI: times within ±tol-ms; a missing or extra hit is accepted when Wi-Fi jitter of
// that size could move its stroke across the bounce or crosstalk window, and those crossings are listed).
// Default mode: tolerant for probe and MIDI debug results (Network MIDI), exact for app results. Exit code 0 = same, 1 = differences, 2 = usage.

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadReference, resolveFixtures } from './fixture-timing.mjs';

export const EXACT_TOL_MS = 0.001;

const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
const r3 = x => Math.round(x * 1000) / 1000;

/** Normalises a results file: { source, aligned, hits: [{ t, pad, note, velocity }], log?: [t0, t1], counters?, summary? }. */
export function readResults(json) {
  if (json?.kind === 'drum-coach-gate0-probe') {
    const log = json.noteLog ?? [...(json.lastLog ?? [])].reverse(); // lastLog is newest first
    const times = log.map(e => e.hostTimeMs);
    return {
      source: json.noteLog ? 'probe noteLog' : 'probe lastLog', aligned: false,
      hits: log.filter(e => e.kind === 'noteOn' && e.verdict === 'hit')
        .map(e => ({ t: e.hostTimeMs, pad: null, note: e.note, velocity: e.velocity })),
      log: times.length ? [Math.min(...times), Math.max(...times)] : null,
      counters: json.counters ?? null, summary: null,
    };
  }
  if (json?.kind === 'drum-coach-midi-debug') {
    const r = json.replay;
    if (!Array.isArray(r?.hits)) throw new Error('this MIDI debug report has no replay: copy it from an app build with QA m9');
    const hits = r.hits.map(h => ({ t: h.time, pad: h.pad ?? null, note: h.note ?? null, velocity: h.velocity }));
    const times = hits.map(h => h.t);
    return {
      source: 'app MIDI debug', aligned: r.timeBase !== 'host',
      hits, log: r.dropped > 0 && times.length ? [Math.min(...times), Math.max(...times)] : null,
      counters: r.counters ?? null, summary: null,
    };
  }
  if (Array.isArray(json?.hits)) {
    return {
      source: 'app results', aligned: json.timeBase !== 'host', fixture: json.fixture,
      hits: json.hits.map(h => ({ t: h.t ?? h.time, pad: h.pad ?? null, note: h.note ?? null, velocity: h.velocity })),
      log: null, counters: json.counters ?? null, summary: json.summary ?? null,
    };
  }
  throw new Error('not a results file: expected the probe\'s "Copy results" JSON, the app\'s MIDI debug report or { hits: [...] }');
}

const sameKey = (a, r) => (a.pad != null ? a.pad === r.pad : a.note === r.note);

/**
 * Finds the offset (results time − reference time) that lines most hits up. Candidates come from the first few
 * results hits against every reference hit on the same pad; the best one is refined to the median residual.
 */
export function align(app, ref, winMs) {
  const sorted = [...ref].sort((a, b) => a.t - b.t);
  const score = off => {
    let n = 0, sum = 0;
    for (const a of app) {
      let best = Infinity;
      for (const r of sorted) { if (r.t > a.t - off + winMs) break; if (sameKey(a, r)) best = Math.min(best, Math.abs(a.t - off - r.t)); }
      if (best <= winMs) { n++; sum += best; }
    }
    return { n, sum };
  };
  const cands = new Set();
  for (const a of app.slice(0, 8)) for (const r of ref) if (sameKey(a, r)) cands.add(a.t - r.t);
  const ranked = [...cands].map(off => ({ off, ...score(off) })).sort((x, y) => y.n - x.n || x.sum - y.sum);
  if (!ranked.length) return { offset: 0, matched: 0, ambiguous: false };
  const best = ranked[0];
  const rival = ranked.find(c => Math.abs(c.off - best.off) > 2 * winMs);
  const residuals = app.flatMap(a => {
    const d = ref.filter(r => sameKey(a, r)).map(r => a.t - best.off - r.t).sort((x, y) => Math.abs(x) - Math.abs(y))[0];
    return d !== undefined && Math.abs(d) <= winMs ? [d] : [];
  });
  return { offset: best.off + median(residuals), matched: best.n, ambiguous: !!rival && rival.n === best.n && best.n > 0 };
}

/** Pairs results hits with reference hits: nearest first, same pad first, then any pad (a pad difference). */
export function pair(app, ref, pairMs) {
  const usedA = new Set(), usedR = new Set(), pairs = [];
  for (const samePad of [true, false]) {
    const cands = [];
    app.forEach((a, i) => { if (!usedA.has(i)) ref.forEach((r, j) => {
      if (!usedR.has(j) && sameKey(a, r) === samePad && Math.abs(a.t - r.t) <= pairMs) cands.push({ i, j, d: a.t - r.t });
    }); });
    cands.sort((x, y) => Math.abs(x.d) - Math.abs(y.d));
    for (const c of cands) if (!usedA.has(c.i) && !usedR.has(c.j)) { usedA.add(c.i); usedR.add(c.j); pairs.push(c); }
  }
  return { pairs, missing: ref.flatMap((r, j) => (usedR.has(j) ? [] : [j])), extra: app.flatMap((a, i) => (usedA.has(i) ? [] : [i])) };
}

/**
 * Reference Note Ons that a timing error of ±tolMs could move across a filter window (src/input/hits.ts): a
 * retrigger near the bounce window, a soft-snare echo on the hi-hat near the crosstalk window (or before the snare).
 */
export function windowRisks(ref, tolMs) {
  const w = ref.windows, kept = new Map(), out = [];
  let snare = null;
  for (const n of ref.noteOns) {
    const prev = kept.get(n.note), gap = prev ? n.t - prev.t : null;
    const soft = prev && n.velocity < prev.velocity * w.bounceRatio;
    if (soft && Math.abs(gap - w.bounceMs) <= tolMs) out.push({ ...n, window: 'bounce', gapMs: r3(gap), limitMs: w.bounceMs });
    if (soft && gap >= 0 && gap < w.bounceMs) continue; // a dropped bounce isn't remembered
    kept.set(n.note, n);
    if (n.pad === 'snare') snare = n;
    else if ((n.pad === 'hhClosed' || n.pad === 'hhOpen') && snare && snare.velocity <= w.crosstalkSnareMax && n.velocity <= snare.velocity) {
      const g = n.t - snare.t;
      if (Math.abs(g - w.crosstalkMs) <= tolMs || (g >= 0 && g <= tolMs)) out.push({ ...n, window: 'crosstalk', gapMs: r3(g), limitMs: g <= tolMs ? 0 : w.crosstalkMs });
    }
  }
  return out;
}

const flatten = (o, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(o ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, `${prefix}${k}.`, out);
    else out[prefix + k] = Array.isArray(v) ? JSON.stringify(v) : v;
  }
  return out;
};

/** The comparison. `mode` is 'exact' or 'tolerant'. */
export function compare(results, ref, { mode, tolMs = 5, pairMs = 30 }) {
  const tol = mode === 'exact' ? EXACT_TOL_MS : tolMs;
  const diffs = [], notes = [];
  const al = results.aligned ? { offset: 0, matched: null, ambiguous: false } : align(results.hits, ref.hits, Math.max(tol, 2));
  if (al.ambiguous) notes.push('alignment is ambiguous: another offset lines up as many hits (repeating bars); check offsetMs');
  const app = results.hits.map(h => ({ ...h, t: h.t - al.offset }));

  // a probe log only covers its last messages: reference hits outside it aren't missing
  const inLog = r => !results.log || (r.t >= results.log[0] - al.offset - tol && r.t <= results.log[1] - al.offset + tol);
  const refHits = ref.hits.filter(inLog), outsideLog = ref.hits.length - refHits.length;
  if (outsideLog) notes.push(`${outsideLog} reference hits fall outside the results log (it keeps the last messages only)`);

  const { pairs, missing, extra } = pair(app, refHits, Math.max(pairMs, tol));
  const risks = mode === 'tolerant' ? windowRisks(ref, tolMs) : [];
  const riskAt = (t, note, verdict) => risks.find(k => k.note === note && k.verdict === verdict && Math.abs(k.t - ref.take.latencyMs - t) <= tol + EXACT_TOL_MS);

  for (const j of missing) {
    const r = refHits[j], why = riskAt(r.t, r.note, 'hit');
    diffs.push({ type: 'missing', t: r.t, pad: r.pad, note: r.note, velocity: r.velocity, ...(why && { explainedBy: `${why.window} window (gap ${why.gapMs} ms vs ${why.limitMs})` }) });
  }
  for (const i of extra) {
    const a = app[i], why = riskAt(a.t, a.note ?? ref.hits.find(r => r.pad === a.pad)?.note, 'filtered');
    diffs.push({ type: 'extra', t: r3(a.t), pad: a.pad, note: a.note, velocity: a.velocity, ...(why && { explainedBy: `${why.window} window (gap ${why.gapMs} ms vs ${why.limitMs})` }) });
  }
  const dts = [];
  for (const { i, j, d } of pairs) {
    const a = app[i], r = refHits[j];
    dts.push(d);
    if (!sameKey(a, r)) diffs.push({ type: 'pad', t: r.t, ref: r.pad ?? r.note, got: a.pad ?? a.note });
    if (a.velocity !== r.velocity) diffs.push({ type: 'velocity', t: r.t, pad: r.pad, ref: r.velocity, got: a.velocity });
    if (Math.abs(d) > tol) diffs.push({ type: 'timing', t: r.t, pad: r.pad, offByMs: r3(d) });
  }

  if (results.counters) {
    const c = results.counters, passes = Math.max(1, Math.round(c.noteOn / ref.counts.noteOn));
    if (passes > 1) notes.push(`counters cover ${passes} passes`);
    for (const k of ['noteOn', 'noteOff', 'clock', 'activeSensing', 'hits', 'filtered']) {
      if ((k === 'clock' || k === 'activeSensing') && !c[k]) continue; // sent with --no-realtime
      if (c[k] === undefined) continue; // not counted by this source (the MIDI debug report has no note-offs)
      if (c[k] !== ref.counts[k] * passes) {
        const soft = mode === 'tolerant' && (k === 'hits' || k === 'filtered'); // jitter moves strokes between them
        diffs.push({ type: 'count', field: k, ref: ref.counts[k] * passes, got: c[k], ...(soft && { explainedBy: 'see the missing/extra hits' }) });
      }
    }
  }
  if (results.summary) {
    const want = flatten(ref.summary), got = flatten(results.summary);
    for (const k of Object.keys(want)) if (want[k] !== got[k]) diffs.push({ type: 'summary', field: k, ref: want[k], got: got[k] ?? null, ...(mode === 'tolerant' && { explainedBy: 'timing tolerance' }) });
  }

  const abs = dts.map(Math.abs);
  return {
    fixture: ref.fixture, mode, tolMs: tol, source: results.source, offsetMs: r3(al.offset),
    hits: { reference: refHits.length, results: app.length, paired: pairs.length, outsideLog },
    timingMs: dts.length ? { median: r3(median(dts)), maxAbs: r3(Math.max(...abs)), within1ms: abs.filter(x => x <= 1).length } : null,
    windowRisks: risks, notes,
    differences: diffs,
    ok: diffs.every(d => d.explainedBy),
  };
}

export function report(c) {
  const lines = [`${c.fixture}: ${c.mode} (±${c.tolMs} ms), ${c.source}, offset ${c.offsetMs} ms`,
    `hits: reference ${c.hits.reference}, results ${c.hits.results}, paired ${c.hits.paired}${c.hits.outsideLog ? `, ${c.hits.outsideLog} outside the log` : ''}`];
  if (c.timingMs) lines.push(`timing (results − reference): median ${c.timingMs.median} ms, max |${c.timingMs.maxAbs}| ms, ${c.timingMs.within1ms} within 1 ms`);
  for (const n of c.notes) lines.push(`note: ${n}`);
  if (c.windowRisks.length) lines.push(`strokes within ±${c.tolMs} ms of a filter window: ${c.windowRisks.length}`,
    ...c.windowRisks.map(k => `  ${k.t} ms ${k.pad ?? k.note} v${k.velocity} ${k.window} gap ${k.gapMs} ms (limit ${k.limitMs}), web: ${k.verdict}`));
  for (const d of c.differences) {
    const { type, explainedBy, ...rest } = d;
    lines.push(`${explainedBy ? 'ok  ' : 'DIFF'} ${type} ${JSON.stringify(rest)}${explainedBy ? ` (${explainedBy})` : ''}`);
  }
  lines.push(c.ok ? (c.differences.length ? 'SAME within tolerance' : 'SAME') : `DIFFERENT: ${c.differences.filter(d => !d.explainedBy).length} unexplained`);
  return lines.join('\n');
}

export function parseArgs(argv) {
  const o = { results: undefined, reference: undefined, fixture: undefined, mode: undefined, tolMs: 5, pairMs: 30, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--exact') o.mode = 'exact';
    else if (a === '--tolerant') o.mode = 'tolerant';
    else if (a === '--reference') o.reference = argv[++i];
    else if (a === '--fixture') o.fixture = argv[++i];
    else if (a === '--tol-ms' || a === '--pair-ms') {
      const n = Number(argv[++i]);
      if (!(n > 0)) throw new Error(`${a} needs a number > 0`);
      o[a === '--tol-ms' ? 'tolMs' : 'pairMs'] = n;
    } else if (a === '--json') o.json = true;
    else if (!a.startsWith('--') && !o.results) o.results = a;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.results) throw new Error('Usage: node compare.mjs <results.json> (--fixture <name> | --reference <file>) [--exact | --tolerant] [--tol-ms 5] [--pair-ms 30] [--json]');
  return o;
}

function main() {
  let o, results, ref;
  try {
    o = parseArgs(process.argv.slice(2));
    results = readResults(JSON.parse(readFileSync(o.results, 'utf8')));
    const fixture = o.fixture ?? results.fixture;
    ref = o.reference ? JSON.parse(readFileSync(o.reference, 'utf8')) : fixture ? loadReference(resolveFixtures(fixture)[0]) : null;
    if (!ref) throw new Error('which fixture? pass --fixture <name> or --reference <file>');
  } catch (e) {
    console.error(e.message ?? e);
    process.exit(2);
  }
  const mode = o.mode ?? (results.source.startsWith('probe') || results.source === 'app MIDI debug' ? 'tolerant' : 'exact');
  const c = compare(results, ref, { mode, tolMs: o.tolMs, pairMs: o.pairMs });
  console.log(o.json ? JSON.stringify(c, null, 2) : report(c));
  process.exit(c.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
