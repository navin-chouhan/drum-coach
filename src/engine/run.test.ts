import { describe, expect, it } from 'vitest';
import { pattern } from './chart';
import { buildRun, splitRun, countInNumber } from './run';

const chart = { title: 'money', bpm: 80, timeSignature: [4, 4] as [number, 4], bars: 1,
  notes: pattern({ hihat: 'xxxxxxxx', kick: 'x...x...', snare: '..x...x.' }, 2) };

describe('splitRun', () => {
  const run = buildRun(chart, { fromBar: 1, toBar: 1, repeats: 2 });

  it('student plays everything without activeLanes', () => {
    const { scored, auto } = splitRun(run);
    expect(scored.notes).toHaveLength(run.notes.length);
    expect(auto).toHaveLength(0);
  });

  it('hi-hat only: kick and snare are played by the app, indexes kept', () => {
    const { scored, auto } = splitRun(run, ['hihat']);
    expect(scored.notes.every(n => n.drum === 'hihat')).toBe(true);
    expect(scored.notes).toHaveLength(16);
    expect(auto).toHaveLength(8);
    expect(auto.every(n => run.notes[n.i] === n)).toBe(true);
    expect(scored.beats).toBe(run.beats);
  });
});

describe('countInNumber', () => {
  it('counts up with the voice through a one- or two-bar count-in', () => {
    expect([-4, -3.5, -3, -2, -1, -0.1].map(p => countInNumber(p, 4))).toEqual([1, 1, 2, 3, 4, 4]);
    expect([-8, -5, -4].map(p => countInNumber(p, 4))).toEqual([1, 4, 1]);
    expect([-3, -2, -1].map(p => countInNumber(p, 3))).toEqual([1, 2, 3]);
  });
});
