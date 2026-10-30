import { describe, expect, it } from 'vitest';
import { pattern } from './chart';
import { barDynamics, offsetOnTarget, swingPct } from './feel';
import { buildRun } from './run';
import type { NoteResult } from './scoring';

const BEAT = 500; // 120 BPM
const runOf = (notes: ReturnType<typeof pattern>, bars = 1) => buildRun({ title: 't', bpm: 120, timeSignature: [4, 4], bars, notes }, { fromBar: 1, toBar: bars, repeats: 1 });
const hit = (offset: number, velocity = 80): NoteResult => ({ judgement: 'good', offset, velocity });

describe('swingPct', () => {
  const eighths = runOf(pattern({ hihat: 'xxxxxxxx' }, 2));
  it('straight 8ths read 50, triplet swing 67', () => {
    expect(swingPct(eighths, eighths.notes.map(() => hit(0)), BEAT)).toBe(50);
    const swung = eighths.notes.map(n => hit(n.pos % 1 ? BEAT / 6 : 0)); // the & pushed from 1/2 to 2/3 of the beat
    expect(swingPct(eighths, swung, BEAT)).toBeCloseTo(66.7, 0);
    const triplets = runOf(pattern({ ride: 'x.xx.xx.xx.x' }, 3));
    expect(swingPct(triplets, triplets.notes.map(() => hit(0)), BEAT)).toBeCloseTo(66.7, 0);
  });
  it('needs 4 pairs with both notes played', () => {
    const r = eighths.notes.map((n, i) => (i < 2 ? hit(0) : { judgement: 'miss' as const }));
    expect(swingPct(eighths, r, BEAT)).toBeNull();
  });
});

describe('barDynamics', () => {
  // 4 bars of snare quarters and kick on 1; targets soft → loud
  const r = runOf(pattern({ snare: 'xxxx', kick: 'x...' }, 1, 4), 4);
  const targets = [1, 1, 2, 3];
  it('a crescendo that follows the marks correlates ≈ 1, each drum against its own mean', () => {
    const vel = (n: (typeof r.notes)[number]) => (n.drum === 'kick' ? 40 : 60) * [1, 1, 1.4, 1.8][n.bar];
    expect(barDynamics(r, r.notes.map(n => hit(0, vel(n))), targets)).toBeGreaterThan(0.95);
  });
  it('flat playing reads 0 (less than 15% range); the wrong way round is negative', () => {
    expect(barDynamics(r, r.notes.map(n => hit(0, 80 + n.bar)), targets)).toBe(0);
    expect(barDynamics(r, r.notes.map(n => hit(0, [110, 100, 70, 40][n.bar])), targets)!).toBeLessThan(-0.8);
    expect(barDynamics(r, r.notes.map(() => hit(0)), [2, 2, 2, 2])).toBeNull(); // no marks that change: nothing to judge
  });
});

describe('offsetOnTarget', () => {
  const perDrum = { snare: { total: 8, hit: 8, accuracy: 100, meanOffset: 22 }, hihat: { total: 16, hit: 16, accuracy: 100, meanOffset: 4 } };
  it('lay back: the snare 15–30 ms behind', () => {
    expect(offsetOnTarget({ meanOffset: 10, perDrum }, { drum: 'snare', ms: 22, tol: 8 })).toEqual({ ok: true, offset: 22 });
    expect(offsetOnTarget({ meanOffset: 10, perDrum }, { drum: 'hihat', ms: 22, tol: 8 })).toEqual({ ok: false, offset: 4 });
    expect(offsetOnTarget({ meanOffset: 10, perDrum }, { ms: 0, tol: 10 })).toEqual({ ok: true, offset: 10 });
  });
});
