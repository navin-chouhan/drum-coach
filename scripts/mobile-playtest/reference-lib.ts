// T4 parity, the web side: replays each src/input/fixtures/*.json through the web input path and matcher
// (replayFixture, as src/input/fixtures.test.ts does) and builds the reference the iPad's score must equal.
// Imports go through the src/ paths (they stay valid through A1's packages/core move, via its re-export shims).
// Under plain Node, import ./resolve-ts.mjs first (src/ imports are extensionless).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { summarizeRun } from '../../src/coach/summary.ts';
import { parseMidiMessage } from '../../src/engine/midi.ts';
import { buildRun } from '../../src/engine/run.ts';
import { replayFixture, type MidiFixture } from '../../src/input/fixtures.ts';
import type { Finished } from '../../src/play/player.ts';

export const FIXTURE_DIR = fileURLToPath(new URL('../../src/input/fixtures/', import.meta.url));
export const REFERENCE_DIR = fileURLToPath(new URL('./reference/', import.meta.url));

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Raw-message counts, as the Gate 0 probe counts them per pass (counters). */
function countMessages(midi: MidiFixture['midi']) {
  const c = { noteOn: 0, noteOff: 0, polyAftertouch: 0, clock: 0, activeSensing: 0, other: 0 };
  for (const [, s, , d2] of midi) {
    if (s === 0xf8) c.clock++;
    else if (s === 0xfe) c.activeSensing++;
    else if ((s & 0xf0) === 0x90 && d2 > 0) c.noteOn++;
    else if ((s & 0xf0) === 0x80 || (s & 0xf0) === 0x90) c.noteOff++;
    else if ((s & 0xf0) === 0xa0) c.polyAftertouch++;
    else c.other++;
  }
  return c;
}

/** The reference for one fixture. Call buildReferences() for all of them (replay order matters, see there). */
function buildReference(file: string, f: MidiFixture) {
  const r = replayFixture(f);
  const run = buildRun(f.chart, { fromBar: f.fromBar, toBar: f.toBar, repeats: f.repeats });
  const beatMs = 60000 / (f.chart.bpm * f.speed);
  const options = { speed: f.speed, fromBar: f.fromBar, toBar: f.toBar, repeats: f.repeats };
  // summarizeRun is the run summary the app saves and sends to the coach; only these fields of Finished are read
  const summary = summarizeRun({ stats: r.stats, run, chart: f.chart, options, cues: [] } as unknown as Finished);

  // Every raw Note On, marked as the input path decided: the hits come out in the same order as their Note Ons
  const hits = r.hits.map(h => ({ t: r3(h.time), pad: h.pad ?? null, velocity: h.velocity }));
  let k = 0;
  const noteOns = f.midi.flatMap(([t, ...data]) => {
    const n = parseMidiMessage(data);
    if (!n) return [];
    const h = r.hits[k], hit = !!h && Math.abs(h.time + f.latencyMs - t) < 0.01 && (h.pad === undefined || f.noteMap[h.pad] === n.note);
    if (hit) k++;
    return [{ t, note: n.note, velocity: n.velocity, verdict: hit ? 'hit' as const : 'filtered' as const }];
  });
  if (k !== r.hits.length) throw new Error(`${file}: matched ${k} of ${r.hits.length} hits to their Note Ons`);

  const e = f.expect;
  return {
    fixture: f.name,
    source: f.source,
    generatedBy: 'node scripts/mobile-playtest/reference.ts',
    fixtureMidiSha256: createHash('sha256').update(JSON.stringify(f.midi)).digest('hex'),
    take: { chart: f.chart.title, bpm: f.chart.bpm, speed: f.speed, fromBar: f.fromBar, toBar: f.toBar, repeats: f.repeats,
      latencyMs: f.latencyMs, goodMs: f.goodMs ?? null, beatMs: r3(beatMs), notes: run.notes.length },
    counts: { ...countMessages(f.midi), hits: hits.length, filtered: noteOns.length - hits.length },
    landed: r.landed,
    extras: r.extras.length,
    expect: e,
    expectMet: (e.minLanded === undefined || r.landed >= e.minLanded) && (e.maxExtras === undefined || r.extras.length <= e.maxExtras)
      && (e.minAccuracy === undefined || r.stats.accuracy >= e.minAccuracy),
    summary,
    /** Hits after the bounce and crosstalk filters: ms after beat 0 (latency removed), pad, velocity. */
    hits,
    /** Every Note On in the fixture (ms after beat 0, before latency) and whether it became a hit. */
    noteOns,
  };
}

export type Reference = ReturnType<typeof buildReference>;

export const fixtureFiles = () => readdirSync(FIXTURE_DIR).filter(n => n.endsWith('.json')).sort();

/**
 * All references, fixtures in file-name order. replayFixture moves its time base on every call, so always build
 * them all, in this order, in a fresh process: then the CLI and the test replay at the same times, bit for bit.
 */
export function buildReferences(): Map<string, Reference> {
  return new Map(fixtureFiles().map(file => {
    const f = JSON.parse(readFileSync(FIXTURE_DIR + file, 'utf8')) as MidiFixture;
    return [file, buildReference(file, f)];
  }));
}

/** Pretty JSON with one line per hit / Note On, so diffs of a reference stay readable. */
export function serialize(ref: Reference): string {
  const rows = new Set(['hits', 'noteOns']);
  const body = Object.entries(ref).map(([k, v]) => {
    const value = rows.has(k) && Array.isArray(v)
      ? (v.length ? `[\n${v.map(x => `    ${JSON.stringify(x)}`).join(',\n')}\n  ]` : '[]')
      : JSON.stringify(v, null, 2).replace(/\n/g, '\n  ');
    return `  ${JSON.stringify(k)}: ${value}`;
  });
  return `{\n${body.join(',\n')}\n}\n`;
}
