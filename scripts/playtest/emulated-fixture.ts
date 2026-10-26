// Writes the emulated-MPS-150 fixture (N11): a ghost-note groove through the emulated kit with retriggers and
// snare → hi-hat crosstalk. Run: node scripts/playtest/emulated-fixture.ts
import { writeFileSync } from 'node:fs';
import { pattern, type Chart } from '../../src/engine/chart.ts';
import { DEFAULT_NOTE_MAP } from '../../src/engine/kit.ts';
import { emulateKit, MPS150, playNotes, seededRandom, STEADY_PLAYER } from '../../src/engine/kitEmulator.ts';
import { buildRun } from '../../src/engine/run.ts';

const chart: Chart = { title: 'Ghost notes (full groove)', bpm: 80, timeSignature: [4, 4], bars: 1,
  notes: pattern({ hihat: 'x.x.x.x.x.x.x.x.', snare: '....X..g.g..X..g', kick: 'x.x....x..x.....' }, 4) };
const run = buildRun(chart, { fromBar: 1, toBar: 1, repeats: 8 }), beatMs = 60000 / chart.bpm, rnd = seededRandom(7);
const raw = emulateKit(playNotes(run.notes.map(n => ({ time: n.t * beatMs, drum: n.drum, accent: n.accent, ghost: n.ghost })), STEADY_PLAYER, rnd), DEFAULT_NOTE_MAP, MPS150, rnd);
const fixture = {
  name: 'emulated-ghost-groove', source: 'emulated', recordedAt: '2026-10-26',
  note: 'retriggers and ghost-snare crosstalk on the hi-hat must not cost notes or add extras',
  noteMap: DEFAULT_NOTE_MAP, chart, speed: 1, fromBar: 1, toBar: 1, repeats: 8, latencyMs: 0,
  midi: raw.map(m => [Math.round(m.timeStamp * 10) / 10, ...m.data]),
  expect: { minLanded: run.notes.length - 2, maxExtras: 1 },
};
writeFileSync(new URL('../../src/input/fixtures/emulated-ghost-groove.json', import.meta.url), JSON.stringify(fixture));
console.log(`${run.notes.length} notes, ${raw.length} MIDI messages`);
