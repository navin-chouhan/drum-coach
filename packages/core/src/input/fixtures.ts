import type { Chart } from '../engine/chart.ts';
import type { NoteMap } from '../engine/kit.ts';
import { buildRun } from '../engine/run.ts';
import { computeStats, createMatcher, noteWindows, toResult, windowsFor, type NoteResult, type PlayedHit } from '../engine/scoring.ts';
import type { KitCalibration } from '../engine/padCal.ts';
import { createHitBus } from './hits.ts';

/**
 * A recorded session (N11): the raw MIDI from the kit with its times, the chart that was played and what the result
 * must be. Real-kit sessions recorded during the M2 checklist (scripts/playtest/helpers.js T.saveFixture) are replayed
 * through the real input path in tests, so kit-specific bugs (retriggers, crosstalk) can't come back.
 */
export type MidiFixture = {
  name: string; note: string; recordedAt: string; source: 'MPS-150' | 'emulated';
  noteMap: NoteMap; chart: Chart; speed: number; fromBar: number; toBar: number; repeats: number;
  latencyMs: number; goodMs?: number;
  midi: [number, number, number, number][]; // [ms after beat 0 of the take, status, data1, data2]
  expect: { minLanded?: number; maxExtras?: number; minAccuracy?: number };
};

let base = 2_000_000_000; // each replay later than the last (on the synthetic host clock)

/**
 * Replays a fixture through the input path (note map, bounce and crosstalk filters) and the matcher, on its own hit
 * bus with the fixture's note map. `zero` is beat 0 on the Clock (host ms); by default each replay is later than the last.
 */
export function replayFixture(f: MidiFixture, opts: { zero?: number; padCal?: KitCalibration } = {}) {
  const zero = opts.zero ?? (base += 10_000_000);
  const bus = createHitBus({ now: () => zero, getNoteMap: () => f.noteMap, getPadCal: () => opts.padCal ?? {} });
  const run = buildRun(f.chart, { fromBar: f.fromBar, toBar: f.toBar, repeats: f.repeats });
  const beatMs = 60000 / (f.chart.bpm * f.speed);
  const hits: PlayedHit[] = [];
  const off = bus.onHit(h => hits.push({ time: h.time - f.latencyMs - zero, pad: h.pad, velocity: h.velocity }));
  for (const [t, ...data] of f.midi) bus.receiveMidi(data, zero + t);
  off();
  const match = createMatcher(noteWindows(run.notes.map(n => ({ time: n.t * beatMs, drum: n.drum, grace: n.grace, buzz: n.buzz })), f.goodMs), windowsFor(beatMs, Infinity, f.goodMs));
  const results: NoteResult[] = run.notes.map(() => ({ judgement: 'miss' })), extras: PlayedHit[] = [];
  for (const h of hits) { const m = match(h); if (m?.bounce) continue; if (m) results[m.index] = toResult(m, h.velocity, h.pad); else extras.push(h); }
  const stats = computeStats(run, results, extras.length, beatMs);
  return { hits, results, extras, stats, landed: results.filter(r => r.offset !== undefined).length };
}
