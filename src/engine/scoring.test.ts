import { describe, expect, it } from 'vitest';
import { pattern } from './chart';
import { buildRun } from './run';
import { computeStats, createMatcher, estimateLatency, latencySuspect, scoreRun, windowsFor, type Expected, type PlayedHit } from './scoring';

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

  it('windows: ±40 perfect, ±100 good; an off-time stroke is a miss but not also an extra', () => {
    expect(scoreRun(expected, perfectHits(40)).results[0].judgement).toBe('perfect');
    expect(scoreRun(expected, perfectHits(-90)).results[0].judgement).toBe('good');
    const late = scoreRun(expected, perfectHits(101));
    expect(late.results.every(r => r.judgement === 'miss' && r.offset === undefined && r.off === 101)).toBe(true);
    expect(late.extras).toHaveLength(0);
  });

  it('at slow tempos a slip still belongs to its note, but a hit on the & is an extra', () => {
    const beat = 1333; // 45 BPM
    const q: Expected[] = [0, 1, 2].map(i => ({ time: 1000 + i * beat, drum: 'snare' }));
    const m = createMatcher(q, windowsFor(beat));
    expect(m({ time: 1000 + 290, pad: 'snare', velocity: 60 })).toMatchObject({ index: 0, judgement: 'miss' }); // 290 ms late
    expect(m({ time: 1000 + beat * 1.5, pad: 'snare', velocity: 60 })).toBeNull(); // the "&"
  });

  it('a stroke is still an extra when no note of that drum is near, or that note was already played', () => {
    const one: Expected[] = [{ time: 1000, drum: 'snare' }];
    expect(scoreRun(one, [{ time: 1300, pad: 'snare', velocity: 80 }]).extras).toHaveLength(1); // 300 ms off
    const twice = scoreRun(one, [{ time: 1000, pad: 'snare', velocity: 80 }, { time: 1150, pad: 'snare', velocity: 80 }]);
    expect(twice.results[0].judgement).toBe('perfect');
    expect(twice.extras).toHaveLength(1);
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

describe('latencySuspect', () => {
  const hits = (offs: number[]) => offs.map(o => (Math.abs(o) <= 100 ? { judgement: 'good' as const, offset: o } : { judgement: 'miss' as const, off: o }));
  it('flags every stroke late by the same amount, counting off-time strokes too', () => {
    expect(latencySuspect(hits([140, 150, 120, 160, 130, 145, 155, 135]))).toBe(142);
    expect(latencySuspect(hits([-60, -50, -70, -55, -65, -45, -60, -58]))).toBe(-58);
  });
  it('stays quiet for normal, mixed timing or too few strokes', () => {
    expect(latencySuspect(hits([20, -30, 50, -10, 60, -40, 15, 5]))).toBeNull();
    expect(latencySuspect(hits([90, 80, 70]))).toBeNull();
    expect(latencySuspect(hits([90, 80, 70, 60, 50, -40, -30, 60]))).toBeNull(); // 75% late: could be the hands
  });
});
