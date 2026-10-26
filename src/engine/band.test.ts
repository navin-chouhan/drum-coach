import { describe, expect, it } from 'vitest';
import { LESSON_BY_ID } from '../content/curriculum';
import { bandFor, bandNotes, bandStyle, chordMidi } from './band';
import { pattern, type Chart } from './chart';
import { buildRun } from './run';

const chart = (notes: Chart['notes'], bars = 1, ts: [number, 2 | 4 | 8 | 16] = [4, 4]): Chart => ({ title: 't', bpm: 100, timeSignature: ts, bars, notes });
const runOf = (c: Chart, repeats = 1) => buildRun(c, { fromBar: 1, toBar: c.bars, repeats });

describe('chordMidi', () => {
  it('root position around middle C, root first', () => {
    expect(chordMidi('C')).toEqual([60, 64, 67]);
    expect(chordMidi('Am')).toEqual([69, 72, 76]);
    expect(chordMidi('E7')).toEqual([64, 68, 71, 74]);
    expect(chordMidi('Bbmaj7')).toEqual([70, 74, 77, 81]);
    expect(chordMidi('F#m7')).toEqual([66, 69, 73, 76]);
    expect(() => chordMidi('H')).toThrow();
  });
});

describe('bandNotes', () => {
  it('rock: the bass plays the chord root on every kick of the bar, held to the next kick', () => {
    const r = runOf(chart(pattern({ kick: 'x...xx..', hihat: 'x.x.x.x.' }, 2)));
    const bass = bandNotes({ style: 'rock', chords: 'A' }, r).filter(n => n.part === 'bass');
    expect(bass.map(n => [n.t, n.dur, n.midi])).toEqual([[0, 2, [45]], [2, 0.5, [45]], [2.5, 1.5, [45]]]);
  });
  it('rock keys: half-note pads; funk: stabs on the &s; shuffle: stabs on 2 and 4', () => {
    const r = runOf(chart(pattern({ kick: 'x.......' }, 2)));
    expect(bandNotes({ style: 'rock', chords: 'C' }, r).filter(n => n.part === 'keys').map(n => [n.t, n.dur])).toEqual([[0, 2], [2, 2]]);
    expect(bandNotes({ style: 'funk', chords: 'C' }, r).filter(n => n.part === 'keys').map(n => n.t)).toEqual([0.5, 1.5, 2.5, 3.5]);
    expect(bandNotes({ style: 'shuffle', chords: 'C' }, r).filter(n => n.part === 'keys').map(n => n.t)).toEqual([1, 3]);
  });
  it('a 12-bar blues wraps: bar 13 is bar 1 again', () => {
    const blues = 'A A A A D D A A E D A E';
    const r = runOf(chart(pattern({ kick: 'x...' }, 1, 12), 12), 2);
    const roots = bandNotes({ style: 'rock', chords: blues }, r).filter(n => n.part === 'bass').map(n => n.midi[0]);
    expect(roots).toHaveLength(24);
    expect(roots[4]).toBe(50); // D
    expect(roots[12]).toBe(roots[0]);
    expect(roots[20]).toBe(roots[8]);
  });
  it('swing: a walking bass whose 4th beat leads into the next bar\'s root by a half step', () => {
    const r = runOf(chart(pattern({ ride: 'x.xx.xx.xx.x' }, 3, 2), 2));
    const walk = bandNotes({ style: 'swing', chords: 'C F' }, r).filter(n => n.part === 'bass');
    expect(walk.map(n => n.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(walk[0].midi[0]).toBe(48); // C
    expect(walk[1].midi[0]).toBe(52); // the 3rd
    expect(walk[3].midi[0]).toBe(40); // E, a half step under F
    expect(walk[4].midi[0]).toBe(41); // F (bass roots sit between E2 and D#3)
  });
  it('nothing is scheduled past the end of the run; a fill bar gets one hit on beat 1', () => {
    const r = runOf(chart(pattern({ kick: 'x..x' }, 1, 2), 2));
    const all = bandNotes({ style: 'rock', chords: 'G', fillBars: [1] }, r);
    expect(all.every(n => n.t + n.dur <= r.beats + 1e-9)).toBe(true);
    const fill = all.filter(n => n.t >= 4);
    expect(fill.map(n => [n.t, n.part])).toEqual([[4, 'bass'], [4, 'keys']]);
  });
});

describe('bandStyle', () => {
  it('guesses the style from the chart', () => {
    const style = (id: string) => bandStyle(LESSON_BY_ID[id].steps.at(-1)!.chart);
    expect(style('song-steady')).toBe('rock');
    expect(style('song-garage')).toBe('rock');
    expect(style('song-shuffle')).toBe('shuffle');
    expect(style('song-swing')).toBe('swing');
    expect(bandStyle(chart(pattern({ hihat: 'xxxxxx', snare: '...x..' }, 2), 1, [6, 8]))).toBe('sixeight');
    expect(bandStyle(chart(pattern({ hihat: 'xxxxx' }, 1), 1, [5, 4]))).toBe('odd');
    expect(bandStyle(chart(pattern({ hihat: 'x.x.x.x.x.x.x.x.', snare: '....X..g.g..X..g', kick: 'x.x....x..x.....' }, 4)))).toBe('funk');
  });
});

describe('bandFor', () => {
  const L = (id: string) => LESSON_BY_ID[id];
  it('on for grooves, songs and fills; off for counting, rudiments, probes and rests', () => {
    expect(bandFor(L('money-8ths'), L('money-8ths').steps.at(-1)!)).toMatchObject({ style: 'rock' });
    expect(bandFor(L('song-shuffle'), L('song-shuffle').steps[0])).toEqual({ style: 'shuffle', chords: 'A A A A D D A A E D A E' });
    expect(bandFor(L('count-8ths'), L('count-8ths').steps[0])).toBeUndefined();
    expect(bandFor(L('singles'), L('singles').steps[0])).toBeUndefined();
    const groove = L('money-8ths');
    expect(bandFor(groove, { ...groove.steps[0], probe: true })).toBeUndefined();
    expect(bandFor(groove, { ...groove.steps[0], rest: 20 })).toBeUndefined();
  });
  it('every built-in song has a chord line that the chord parser reads', () => {
    for (const id of ['song-steady', 'song-garage', 'song-shuffle', 'song-swing']) {
      const b = bandFor(L(id), L(id).steps[0])!;
      expect(L(id).band?.chords, id).toBeDefined();
      for (const c of b.chords!.split(' ')) expect(() => chordMidi(c)).not.toThrow();
    }
  });
});
