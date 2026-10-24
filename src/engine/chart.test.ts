import { describe, expect, it } from 'vitest';
import { ChartSchema, beatsPerBar, padMatches, pattern } from './chart';
import { buildRun } from './run';
import { LIBRARY } from '../content/library';

describe('chart', () => {
  it('pattern builds notes with accents and ghosts', () => {
    expect(pattern({ snare: 'X.g.' }, 2)).toEqual([{ t: 0, drum: 'snare', accent: true }, { t: 1, drum: 'snare', ghost: true }]);
    expect(pattern({ kick: 'x...' }, 4, 2).map(n => n.t)).toEqual([0, 1]);
  });

  it('hi-hat lane accepts open and closed, hhOpen only open', () => {
    expect(padMatches('hihat', 'hhOpen')).toBe(true);
    expect(padMatches('hihat', 'hhClosed')).toBe(true);
    expect(padMatches('hhOpen', 'hhClosed')).toBe(false);
    expect(padMatches('hihat', 'hhPedal')).toBe(false);
  });

  it('schema rejects notes past the end and unknown drums', () => {
    const ok = { title: 'x', bpm: 90, timeSignature: [4, 4], bars: 1, notes: [{ t: 3.5, drum: 'kick' }] };
    expect(ChartSchema.safeParse(ok).success).toBe(true);
    expect(ChartSchema.safeParse({ ...ok, notes: [{ t: 4, drum: 'kick' }] }).success).toBe(false);
    expect(ChartSchema.safeParse({ ...ok, notes: [{ t: 0, drum: 'cowbell' }] }).success).toBe(false);
  });

  it('6/8 has 3 quarter beats per bar', () => {
    expect(beatsPerBar({ timeSignature: [6, 8] })).toBe(3);
  });

  it('every built-in chart is valid with unique ids', () => {
    for (const c of LIBRARY) expect(ChartSchema.safeParse(c).success, c.title).toBe(true);
    expect(new Set(LIBRARY.map(c => c.id)).size).toBe(LIBRARY.length);
    expect(LIBRARY.filter(c => c.kind === 'groove').length).toBeGreaterThanOrEqual(5);
  });
});

describe('buildRun', () => {
  const chart = { title: 't', bpm: 100, timeSignature: [4, 4] as [number, 4], bars: 3, notes: pattern({ kick: 'x.x.' }, 1, 3) };
  it('loops bars A–B and renumbers time from the run start', () => {
    const run = buildRun(chart, { fromBar: 2, toBar: 3, repeats: 2 });
    expect(run.beats).toBe(16);
    expect(run.notes.map(n => n.t)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
    expect(run.notes[3]).toMatchObject({ bar: 1, pos: 2, i: 3 });
  });
  it('clamps a bad section', () => {
    expect(buildRun(chart, { fromBar: 3, toBar: 1, repeats: 0 }).beats).toBe(4);
  });
});

describe('chart level', () => {
  it('accepts level 0 (the first curriculum level, also used by coach-written lessons)', () => {
    const c = { title: 'x', bpm: 60, timeSignature: [4, 4], bars: 1, level: 0, notes: [{ t: 0, drum: 'snare' }] };
    expect(ChartSchema.safeParse(c).success).toBe(true);
  });
});
