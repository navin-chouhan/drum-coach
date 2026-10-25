import { describe, expect, it } from 'vitest';
import { pattern } from './chart';
import { buildRun } from './run';
import { computeStats, createMatcher, estimateLatency, latencySuspect, minGapBeats, reactingToClick, scoreRun, windowsFor, type Expected, type PlayedHit } from './scoring';

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
    expect(s.velocity).toEqual({ normalMean: 80, normalCv: 0, accentMean: 120, ghostMean: 30, pairDrop: 0 });
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

describe('timing stats count off-time strokes', () => {
  it('a dragging player is reported as late as they are, though off-time strokes still count against accuracy', () => {
    const q = buildRun({ title: 'q', bpm: 60, timeSignature: [4, 4], bars: 2, notes: pattern({ snare: 'xxxxxxxx' }, 1) }, { fromBar: 1, toBar: 2, repeats: 1 });
    const exp: Expected[] = q.notes.map(n => ({ time: 1000 + n.t * 1000, drum: n.drum }));
    const hits = exp.map((e, k) => ({ time: e.time + (k < 4 ? 20 : 150), pad: 'snare' as const, velocity: 80 })); // 4 good, 4 off-time
    const { results, extras } = scoreRun(exp, hits);
    const s = computeStats(q, results, extras.length);
    expect(s.accuracy).toBe(50);
    expect(s.meanOffset).toBe(85); // (4×20 + 4×150) / 8, not 20
    expect(s.spread).toBe(65);
    expect(s.perDrum.snare?.meanOffset).toBe(85);
  });
});

describe('reactingToClick', () => {
  const sixteenths = (bpm: number, n = 32): Expected[] => Array.from({ length: n }, (_, i) => ({ time: 1000 + (i * 15000) / bpm, drum: 'snare' }));
  const play = (q: Expected[], late: number, wobble = 0): PlayedHit[] => q.map((e, i) => ({ time: e.time + late + ((i % 3) - 1) * wobble, pad: 'snare', velocity: 80 }));
  it('a reaction time after the first note and after the latest one is reacting, even though the matcher scores it well', () => {
    const q = sixteenths(80); // 187.5 ms apart: 180 ms late lands just before the next note
    const r = reactingToClick(q, play(q, 180, 30));
    expect(r).toBeGreaterThanOrEqual(150); expect(r).toBeLessThanOrEqual(210);
    expect(reactingToClick(q, play(q, 180).slice(0, 12))).toBe(180); // mid-take, for the live tip
    expect(scoreRun(q, play(q, 180, 30)).results.filter(r => r.judgement !== 'miss').length).toBeGreaterThan(28);
  });
  it('merely late, rushing on fast notes, a stroke on the first note, or coming in late but then on time: not reacting', () => {
    const q = sixteenths(80), fast = sixteenths(160);
    expect(reactingToClick(q, play(q, 40, 30))).toBeNull();
    expect(reactingToClick(fast, play(fast, -30, 10))).toBeNull(); // rusher: a stroke before the first note
    expect(reactingToClick(q, [{ time: q[0].time, pad: 'snare', velocity: 80 }, ...play(q, 180).slice(1)])).toBeNull();
    expect(reactingToClick(q, play(q, 15).slice(1))).toBeNull(); // missed note 1, then on the notes
  });
});

describe('windows shrink for fast notes', () => {
  it('Good is 40% of the closest same-drum gap, capped at ±100', () => {
    expect(windowsFor(1000)).toMatchObject({ good: 100, perfect: 40 });
    const gap = minGapBeats(pattern({ snare: 'xxxxxxxxxxxxxxxx', kick: 'x...x...x...x...' }, 4)); // snare 16ths
    expect(gap).toBe(0.25);
    expect(windowsFor(600, gap * 600)).toMatchObject({ good: 60, perfect: 30 }); // 16ths at 100 BPM: 150 ms apart
    expect(minGapBeats([{ t: 0, drum: 'kick' }, { t: 0, drum: 'hihat' }])).toBe(Infinity); // different drums don't count
  });
});

describe('flam and pair drop', () => {
  const together = buildRun({ title: 'f', bpm: 60, timeSignature: [4, 4], bars: 1, notes: pattern({ hihat: 'xxxx', kick: 'xxxx' }, 1) }, { fromBar: 1, toBar: 1, repeats: 1 });
  const res = (offsets: number[], vel = 90) => offsets.map(offset => ({ judgement: 'good' as const, offset, velocity: vel }));
  it('flam is the mean split between notes meant to land together', () => {
    // notes sorted by t: pairs (hihat, kick) at each beat
    expect(computeStats(together, res([30, -10, 30, -10, 30, -10, 30, -10]), 0).flam).toBe(40);
    expect(computeStats(together, res([5, 5, 5, 5, 5, 5, 5, 5]), 0).flam).toBe(0);
  });
  it('pair drop: the 2nd of each pair softer than the 1st; a miss does not shift the pairing', () => {
    const singles = buildRun({ title: 'd', bpm: 60, timeSignature: [4, 4], bars: 1, notes: pattern({ snare: 'xxxxxxxxxxxxxxxx' }, 4) }, { fromBar: 1, toBar: 1, repeats: 1 });
    const vels = Array.from({ length: 16 }, (_, i) => (i % 2 ? 70 : 100));
    const r = vels.map(velocity => ({ judgement: 'good' as const, offset: 0, velocity }));
    expect(computeStats(singles, r, 0).velocity.pairDrop).toBe(30);
    const missed = [{ judgement: 'miss' as const }, ...r.slice(1)];
    expect(computeStats(singles, missed, 0).velocity.pairDrop).toBe(30);
  });
});
