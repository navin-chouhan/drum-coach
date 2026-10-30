// Parity with the web app: the copied hit path (parseMidiMessage + bounce/crosstalk filter) must give exactly the
// hits the web input path (src/input/hits.ts receiveMidi) gives, for the recorded fixtures and the web's own test
// vectors. Imports the web source directly: this test goes away when A1 moves both into @drum-coach/core.

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { onHit, receiveMidi } from '../../../../src/input/hits';
import { createHitFilter, type Hit } from './hitFilter';
import { DEFAULT_NOTE_MAP } from './kit';
import { parseMidiMessage } from './midi';
import { createProbe } from './probe';

const FIXTURES = new URL('../../../../src/input/fixtures/', import.meta.url);
type Fixture = { name: string; midi: number[][] };
const fixtures: Fixture[] = readdirSync(FIXTURES).filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(readFileSync(new URL(f, FIXTURES), 'utf8')));

let base = 1_000_000; // the web filter keeps module state: each run later than the last

/** The stream at absolute times past everything the web filter has seen (it keeps module state). */
const shift = (stream: number[][]) => { const zero = (base += 1_000_000); return stream.map(([t, ...d]) => [zero + t, ...d]); };

function web(stream: number[][]): Hit[] {
  const got: Hit[] = [];
  const off = onHit(h => got.push(h));
  for (const [t, ...data] of stream) receiveMidi(data, t);
  off();
  return got;
}

function spike(stream: number[][]): Hit[] {
  const filter = createHitFilter(() => DEFAULT_NOTE_MAP), got: Hit[] = [];
  for (const [t, ...data] of stream) {
    const n = parseMidiMessage(data);
    const h = n && filter.push(n.note, n.velocity, t);
    if (h) got.push(h);
  }
  return got;
}

function probe(stream: number[][]): Hit[] {
  const p = createProbe();
  return stream.flatMap(([t, ...bytes]) => p.ingest({ bytes, hostTimeMs: t, nativeReceivedMs: t }, t));
}

describe('the copied hit path matches the web input path', () => {
  it('there are fixtures to compare', () => expect(fixtures.length).toBeGreaterThan(0));

  for (const f of fixtures) it(`fixture ${f.name}`, () => {
    const stream = shift(f.midi), w = web(stream);
    expect(w.length).toBeGreaterThan(0);
    expect(spike(stream)).toEqual(w);
    expect(probe(stream)).toEqual(w);
  });

  it('the web hits.test.ts bounce vectors', () => {
    const v: [number, number, number][] = [[38, 42, 1000], [38, 21, 1040], [38, 20, 2000], [38, 90, 2030], [38, 50, 3000], [38, 30, 3070],
      [36, 40, 4000], [38, 30, 4010], [38, 92, 5000], [38, 80, 5045], [38, 67, 6000], [38, 34, 6040], [38, 35, 7000], [38, 22, 7030],
      [38, 33, 8000], [38, 88, 8030], [38, 18, 8045], [38, 44, 8070]];
    const stream = shift(v.map(([note, vel, t]) => [t, 0x99, note, vel]));
    const s = spike(stream);
    expect(s).toEqual(web(stream));
    expect(s.map(h => h.velocity).slice(0, 11)).toEqual([42, 20, 90, 50, 30, 40, 30, 92, 80, 67, 35]);
  });

  it('crosstalk: a ghost snare echo on the hi-hat is dropped, a real hi-hat stroke is kept', () => {
    const stream = shift([[0, 0x99, 38, 30], [10, 0x99, 46, 25], [1000, 0x99, 38, 30], [1010, 0x99, 46, 80], [2000, 0x99, 38, 100], [2010, 0x99, 42, 60]]);
    const s = spike(stream);
    expect(s).toEqual(web(stream));
    expect(s.map(h => h.note)).toEqual([38, 38, 46, 38, 42]);
  });
});
