import { describe, expect, it } from 'vitest';
import { pattern } from './chart';
import { buildRun } from './run';
import { cleanBars, computeStats, createMatcher, heatSlotName, recentAccuracy, worstBars, estimateLatency, latencyOffsets, latencySuspect, noteWindows, reactingToClick, scoreRun, windowsFor, type Expected, type PlayedHit } from './scoring';

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

describe('per-note timing windows (R2)', () => {
  // 120 BPM: hi-hat 8ths (250 ms apart) beside snare 16ths (125 ms apart)
  const c = { ...chart, notes: pattern({ hihat: 'x.x.x.x.x.x.x.x.', snare: 'xxxx............' }, 4) };
  const r = buildRun(c, { fromBar: 1, toBar: 1, repeats: 1 });
  const exp = noteWindows(r.notes.map(n => ({ time: 1000 + n.t * 500, drum: n.drum })), 100);
  it('each note gets 40% of the gap to its nearest same-drum neighbour, capped at Good', () => {
    expect(exp.filter(e => e.drum === 'hihat').every(e => e.good === 100)).toBe(true);
    expect(exp.filter(e => e.drum === 'snare').every(e => e.good === 50)).toBe(true);
  });
  it('8ths keep ±100 ms beside 16ths on another drum; the 16ths are judged tighter', () => {
    const hh = exp.findIndex(e => e.drum === 'hihat' && e.time === 2000), sn = exp.findIndex(e => e.drum === 'snare' && e.time === 1000);
    const match = createMatcher(exp, windowsFor(500, Infinity, 100));
    expect(match({ time: 2090, pad: 'hhClosed', velocity: 80 })).toMatchObject({ index: hh, judgement: 'good' });
    expect(match({ time: 1060, pad: 'snare', velocity: 80 })).toMatchObject({ index: sn, judgement: 'miss' }); // 60 ms on a 16th: off time
    // one window for the whole take (the old way) would have shrunk the hi-hat to ±50 too
    expect(createMatcher(exp.map(({ time, drum }) => ({ time, drum })), windowsFor(500, 125, 100))({ time: 2090, pad: 'hhClosed', velocity: 80 })?.judgement).toBe('miss');
  });
});

describe('grace notes (R2): flam, drag, ruff', () => {
  const sn = (time: number, velocity: number): PlayedHit => ({ time, pad: 'snare', velocity });
  it('a flam: the soft grace stroke, then the main one takes the note over (offset from the main stroke)', () => {
    const { results, extras } = scoreRun([{ time: 1000, drum: 'snare', grace: 1 }], [sn(975, 35), sn(1000, 90)]);
    expect(extras).toHaveLength(0);
    expect(results[0]).toMatchObject({ judgement: 'perfect', offset: 0, velocity: 90, grace: { strokes: 1, gapMs: 25 } });
    expect(results[0].grace!.ratio).toBeCloseTo(0.39, 2);
  });
  it('a drag: two grace strokes', () => {
    const { results, extras } = scoreRun([{ time: 1000, drum: 'snare', grace: 2 }], [sn(950, 35), sn(975, 35), sn(1000, 90)]);
    expect(extras).toHaveLength(0);
    expect(results[0]).toMatchObject({ offset: 0, grace: { strokes: 2, gapMs: 50 } });
  });
  it('a flam played as one note says so; a soft bounce after the main stroke never takes over', () => {
    expect(scoreRun([{ time: 1000, drum: 'snare', grace: 1 }], [sn(1000, 90)]).results[0].grace).toMatchObject({ strokes: 0 });
    const b = scoreRun([{ time: 1000, drum: 'snare', grace: 1 }], [sn(975, 35), sn(1000, 90), sn(1030, 45)]);
    expect(b.results[0]).toMatchObject({ offset: 0, grace: { strokes: 1 } });
    expect(b.extras).toHaveLength(1);
  });
  it('no grace in the chart: a second stroke 30 ms later is still an extra (regression)', () => {
    const { results, extras } = scoreRun([{ time: 1000, drum: 'snare' }], [sn(1000, 90), sn(1030, 90)]);
    expect(results[0]).toMatchObject({ offset: 0 });
    expect(results[0].grace).toBeUndefined();
    expect(extras).toHaveLength(1);
  });
  it('the chain stops after 120 ms', () => {
    const { results, extras } = scoreRun([{ time: 1000, drum: 'snare', grace: 3 }], [sn(880, 40), sn(930, 40), sn(980, 40), sn(1030, 90)]);
    expect(results[0].grace!.strokes).toBe(2); // the 4th stroke would make the chain 150 ms long
    expect(extras).toHaveLength(1);
  });
  it('stats: how many graces came out as grace + main, their gap and volume ratio', () => {
    const r = buildRun({ title: 'f', bpm: 60, timeSignature: [4, 4], bars: 1, notes: [0, 1, 2, 3].map(t => ({ t, drum: 'snare' as const, grace: 1 as const })) }, { fromBar: 1, toBar: 1, repeats: 1 });
    const exp = r.notes.map(n => ({ time: 1000 + n.t * 1000, drum: n.drum, grace: n.grace }));
    const hits = exp.flatMap((e, i) => (i === 3 ? [sn(e.time, 90)] : [sn(e.time - 20, 30), sn(e.time, 90)]));
    const s = computeStats(r, scoreRun(exp, hits).results, 0);
    expect(s.grace).toEqual({ notes: 4, played: 3, pct: 75, gapMs: 20, ratio: 0.33 });
  });
});

describe('buzz notes (R2)', () => {
  const sn = (time: number, velocity = 60): PlayedHit => ({ time, pad: 'snare', velocity });
  it('the bounces of a buzz stroke are part of the note, not extras, until the next note', () => {
    const exp = [{ time: 1000, drum: 'snare' as const, buzz: true }, { time: 1250, drum: 'snare' as const, buzz: true }];
    const { results, extras } = scoreRun(exp, [sn(1000, 80), sn(1030), sn(1060), sn(1090), sn(1250, 80), sn(1280), sn(1310)]);
    expect(extras).toHaveLength(0);
    expect(results.map(r => r.offset)).toEqual([0, 0]);
  });
  it('without buzz the same strokes are extras (regression)', () => {
    const exp = [{ time: 1000, drum: 'snare' as const }, { time: 1250, drum: 'snare' as const }];
    expect(scoreRun(exp, [sn(1000, 80), sn(1030), sn(1060), sn(1250, 80)]).extras).toHaveLength(2);
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

  it('weak spots of a triplet groove land on the triplet grid (12 slots per 4/4 bar)', () => {
    const shuffle = { ...chart, notes: pattern({ hihat: 'x.xx.xx.xx.x', snare: '...x.....x..', kick: 'x.....x.....' }, 3) };
    const r = buildRun(shuffle, { fromBar: 1, toBar: 1, repeats: 1 });
    const exp: Expected[] = r.notes.map(n => ({ time: 1000 + n.t * 500, drum: n.drum }));
    const letOf2 = r.notes.findIndex(n => n.drum === 'hihat' && Math.abs(n.pos - 5 / 3) < 1e-6);
    const hits = exp.flatMap((e, i) => (i === letOf2 ? [] : [{ time: e.time, pad: PAD[e.drum as keyof typeof PAD], velocity: 90 }]));
    const s = computeStats(r, scoreRun(exp, hits).results, 0);
    expect(s.heat).toHaveLength(12);
    expect(s.heat[5]).toMatchObject({ total: 1, miss: 1 }); // beat 2, "let"
    expect(s.heat.filter(c => c.miss)).toHaveLength(1);
    expect(heatSlotName(5, 12, 4)).toBe('beat 2 let');
    expect(heatSlotName(6, 16, 4)).toBe('beat 2 &');
    expect(s.heat[0]).toMatchObject({ total: 2, miss: 0 });
  });

  it('velocity: accent and ghost means, consistency', () => {
    const hits = perfectHits().map((h, i) => ({ ...h, velocity: run.notes[i].accent ? 120 : run.notes[i].ghost ? 30 : 80 }));
    const { results } = scoreRun(expected, hits);
    const s = computeStats(run, results, 0);
    expect(s.velocity).toEqual({ normalMean: 80, normalCv: 0, accentMean: 120, ghostMean: 30, pairDrop: 0 });
  });
});

describe('worstBars', () => {
  // 4-bar section played twice, a quarter note per beat: 32 notes, bar = run bar (0–7)
  const notes = Array.from({ length: 32 }, (_, i) => ({ t: i, drum: 'snare' as const, i, bar: Math.floor(i / 4), pos: i % 4 }));
  const run = { notes, beats: 32, beatsPerBar: 4 };
  const hit = { judgement: 'good' as const, offset: 5, velocity: 90 }, miss = { judgement: 'miss' as const };
  it('folds repeats and returns the stickiest bar first', () => {
    const results = notes.map(n => (n.bar % 4 === 2 && n.pos < 3) || (n.bar === 1 && n.pos === 0) ? miss : hit);
    expect(worstBars(run, results, 4)).toEqual([3]); // bar 2 had one miss only: not sticky
    expect(worstBars(run, results, 4, 5)).toEqual([7]); // a section starting at chart bar 5
  });
  it('returns nothing for a clean take or a one-bar section', () => {
    expect(worstBars(run, notes.map(() => hit), 4)).toEqual([]);
    expect(worstBars(run, notes.map(() => miss), 1)).toEqual([]);
  });
});

describe('cleanBars', () => {
  it('counts bars with no miss and no extra', () => {
    const notes = Array.from({ length: 16 }, (_, i) => ({ t: i, drum: 'snare' as const, i, bar: Math.floor(i / 4), pos: i % 4 }));
    const results = notes.map(n => (n.t === 5 ? { judgement: 'miss' as const } : { judgement: 'good' as const, offset: 0, velocity: 90 }));
    expect(cleanBars({ notes, beats: 16, beatsPerBar: 4 }, results, [10.5])).toBe(2); // bar 2 missed, bar 3 had an extra
  });
});

describe('recentAccuracy', () => {
  it('scores only the notes in the window', () => {
    const notes = Array.from({ length: 32 }, (_, i) => ({ t: i, drum: 'snare' as const, i, bar: Math.floor(i / 4), pos: i % 4 }));
    const results = notes.map(n => (n.t >= 16 && n.t % 4 === 0 ? { judgement: 'miss' as const } : { judgement: 'good' as const, offset: 0, velocity: 90 }));
    expect(recentAccuracy(results, { notes, beats: 32, beatsPerBar: 4 }, 16, 32)).toBe(75);
    expect(recentAccuracy(results, { notes, beats: 32, beatsPerBar: 4 }, 0, 16)).toBe(100);
    expect(recentAccuracy(results, { notes, beats: 32, beatsPerBar: 4 }, 40, 44)).toBeNull();
  });
});

describe('streaks', () => {
  it('counts the longest run of hits and the comebacks after a miss', () => {
    const notes = Array.from({ length: 6 }, (_, i) => ({ t: i, drum: 'snare' as const, i, bar: 0, pos: i % 4 }));
    const hit = { judgement: 'good' as const, offset: 5, velocity: 90 }, miss = { judgement: 'miss' as const };
    const s = computeStats({ notes, beats: 6, beatsPerBar: 4 }, [hit, hit, miss, hit, hit, hit], 0);
    expect(s).toMatchObject({ streak: 3, recoveries: 1 });
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

  // Synthetic hit streams for the iPad's first-run report: "16 of 16 hits", "17 taps, spread ±69 ms".
  const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const gauss = (r: () => number) => (r() + r() + r() + r() + r() + r() - 3) * Math.SQRT2; // ~N(0, 1)
  const steady = (sd: number, bias: number, seed = 7) => { const r = rng(seed); return clicks.map(c => c + bias + gauss(r) * sd); };

  it('counts one tap per click: a double hit is the same stroke (17 taps on 16 clicks before)', () => {
    const taps = [...steady(15, -10), clicks[5] + 70, clicks[11] + 120]; // two retriggers / doubles
    const e = estimateLatency(clicks, taps)!;
    expect(latencyOffsets(clicks, taps)).toHaveLength(16);
    expect(e.n).toBe(16);
    expect(Math.abs(e.latencyMs + 10)).toBeLessThanOrEqual(8);
    expect(e.spread).toBeLessThan(30);
  });

  it('a steady player with a couple of stray strokes is still steady (the old std said ±60+)', () => {
    const taps = steady(18, 25);
    taps[3] = clicks[3] + 190; taps[9] = clicks[9] - 180; // two strays, still inside ±200 ms
    const e = estimateLatency(clicks, taps)!;
    expect(e.n).toBe(16);
    expect(Math.abs(e.latencyMs - 25)).toBeLessThanOrEqual(10);
    expect(e.spread).toBeLessThan(40);
  });

  it('a player who reacts instead of playing along is still not steady', () => {
    const r = rng(3);
    const taps = clicks.map(c => c + 60 + (r() - 0.5) * 300); // ±150 ms all over
    expect(estimateLatency(clicks, taps)!.spread).toBeGreaterThan(50);
  });

  it('measures the same on a clock 1e9 ms on (the iPad host clock)', () => {
    const taps = steady(15, 30);
    const a = estimateLatency(clicks, taps)!, b = estimateLatency(clicks.map(c => c + 1e9), taps.map(t => t + 1e9))!;
    expect(b).toEqual(a);
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
    const w = noteWindows(pattern({ snare: 'xxxxxxxxxxxxxxxx', kick: 'x...x...x...x...' }, 4).sort((a, b) => a.t - b.t).map(n => ({ time: n.t * 600, drum: n.drum })));
    expect(w.find(e => e.drum === 'snare')?.good).toBe(60); // 16ths at 100 BPM: 150 ms apart
    expect(w.find(e => e.drum === 'kick')?.good).toBe(100);
    expect(windowsFor(600, 150)).toMatchObject({ good: 60, perfect: 30 });
    expect(noteWindows([{ time: 0, drum: 'kick' }, { time: 0, drum: 'hihat' }]).map(e => e.good)).toEqual([100, 100]); // different drums don't count
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

describe('a late stroke belongs to the note before it', () => {
  // snare 8ths at 120 BPM: notes 250 ms apart, Good ±100, Near 250
  const q: Expected[] = Array.from({ length: 8 }, (_, i) => ({ time: 1000 + i * 250, drum: 'snare' }));
  const w = windowsFor(500, 250);
  it('dragging by more than half a gap is reported as dragging, and the next on-time stroke is not an extra', () => {
    const m = createMatcher(q, w);
    expect(m({ time: 1130, pad: 'snare', velocity: 80 })).toMatchObject({ index: 0, offset: 130, judgement: 'miss' });
    expect(m({ time: 1250, pad: 'snare', velocity: 80 })).toMatchObject({ index: 1, judgement: 'perfect' });
  });
  it('a whole take dragged by 130 ms (uncorrected latency) reads as late, not early', () => {
    const { results, extras } = scoreRun(q, q.map(e => ({ time: e.time + 130, pad: 'snare' as const, velocity: 80 })));
    expect(results.every(r => r.judgement === 'miss' && r.off === 130)).toBe(true);
    expect(extras).toHaveLength(0);
    expect(latencySuspect(results)).toBe(130);
  });
  it('a repeat stroke right after a played note is still an extra, and an early stroke still claims the next note', () => {
    const m = createMatcher(q, w);
    expect(m({ time: 1000, pad: 'snare', velocity: 80 })).toMatchObject({ index: 0, judgement: 'perfect' });
    expect(m({ time: 1060, pad: 'snare', velocity: 80 })).toBeNull(); // bounce-like repeat, nearest note already played
    expect(m({ time: 1380, pad: 'snare', velocity: 80 })).toMatchObject({ index: 1, offset: 130, judgement: 'miss' }); // note 1 is still open behind it: late for note 1
    expect(m({ time: 1630, pad: 'snare', velocity: 80 })).toMatchObject({ index: 2, offset: 130, judgement: 'miss' });
    const early = createMatcher(q, w);
    expect(early({ time: 890, pad: 'snare', velocity: 80 })).toMatchObject({ index: 0, offset: -110, judgement: 'miss' }); // nothing behind it: early for note 0
  });
});
