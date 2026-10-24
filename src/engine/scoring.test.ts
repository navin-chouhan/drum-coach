import { describe, expect, it } from 'vitest';
import { pattern } from './chart';
import { buildRun } from './run';
import { computeStats, createMatcher, estimateLatency, scoreRun, type Expected, type PlayedHit } from './scoring';

// 4/4 rock bar at 120 bpm → 500 ms per beat
const chart = { title: 't', bpm: 120, timeSignature: [4, 4] as [number, 4], bars: 1,
  notes: pattern({ hihat: 'x.x.x.x.x.x.x.x.', snare: '....X.......g...', kick: 'x.......x.......' }, 4) };
const run = buildRun(chart, { fromBar: 1, toBar: 1, repeats: 1 });
const expected: Expected[] = run.notes.map(n => ({ time: 1000 + n.t * 500, drum: n.drum }));
const PAD = { hihat: 'hhClosed', snare: 'snare', kick: 'kick' } as const;
const perfectHits = (shift = 0): PlayedHit[] =>
  expected.map(e => ({ time: e.time + shift, pad: PAD[e.drum as keyof typeof PAD], velocity: 90 }));

describe('matcher', () => {
  it('perfect play: everything perfect, no extras', () => {
    const { results, extras } = scoreRun(expected, perfectHits());
    expect(results.every(r => r.judgement === 'perfect')).toBe(true);
    expect(extras).toHaveLength(0);
  });

  it('windows: ±25 perfect, ±60 good, beyond that miss + extra', () => {
    expect(scoreRun(expected, perfectHits(25)).results[0].judgement).toBe('perfect');
    expect(scoreRun(expected, perfectHits(-40)).results[0].judgement).toBe('good');
    const late = scoreRun(expected, perfectHits(61));
    expect(late.results.every(r => r.judgement === 'miss')).toBe(true);
    expect(late.extras).toHaveLength(expected.length);
  });

  it('wrong drum is an extra, not a hit', () => {
    const m = createMatcher(expected);
    expect(m({ time: 1000, pad: 'snare', velocity: 80 })).toBeNull();
    expect(m({ time: 1000, pad: 'kick', velocity: 80 })).toMatchObject({ judgement: 'perfect' });
  });

  it('open hi-hat counts for a hi-hat note; a note is matched only once', () => {
    const m = createMatcher(expected);
    expect(m({ time: 1010, pad: 'hhOpen', velocity: 80 })?.index).toBe(0);
    expect(m({ time: 1012, pad: 'hhClosed', velocity: 80 })).toBeNull();
  });

  it('unmapped hits are extras', () => {
    expect(createMatcher(expected)({ time: 1000, velocity: 80 })).toBeNull();
  });
});

describe('stats', () => {
  it('detects rushing and per-drum accuracy', () => {
    const hits = perfectHits(-20).filter(h => h.pad !== 'kick');
    const { results, extras } = scoreRun(expected, hits);
    const s = computeStats(run, results, extras.length);
    expect(s.meanOffset).toBe(-20);
    expect(s.spread).toBe(0);
    expect(s.perDrum.kick).toMatchObject({ total: 2, hit: 0, accuracy: 0 });
    expect(s.perDrum.hihat?.accuracy).toBe(100);
    expect(s.accuracy).toBe(83.3); // 10 of 12 notes
    expect(s.heat).toHaveLength(16);
    expect(s.heat[0]).toMatchObject({ total: 2, miss: 1 }); // hi-hat hit + kick missed on beat 1
  });

  it('velocity: accent and ghost means, consistency', () => {
    const hits = perfectHits().map((h, i) => ({ ...h, velocity: run.notes[i].accent ? 120 : run.notes[i].ghost ? 30 : 80 }));
    const { results } = scoreRun(expected, hits);
    const s = computeStats(run, results, 0);
    expect(s.velocity).toEqual({ normalMean: 80, normalCv: 0, accentMean: 120, ghostMean: 30 });
  });
});

describe('estimateLatency', () => {
  const clicks = Array.from({ length: 16 }, (_, i) => 1000 + i * 500);
  it('returns the median offset', () => {
    const taps = clicks.map((c, i) => c + 30 + (i % 2 ? 5 : -5));
    expect(estimateLatency(clicks, taps)).toMatchObject({ latencyMs: 30, n: 16 });
  });
  it('ignores stray taps and needs at least 6', () => {
    expect(estimateLatency(clicks, [1250, 1750, 1030])).toBeNull();
  });
});
