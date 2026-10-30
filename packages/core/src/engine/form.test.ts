import { describe, expect, it } from 'vitest';
import { pattern, type Chart } from './chart';
import { expandForm, playOrder } from './form';

describe('playOrder', () => {
  it('plays a repeat twice', () => expect(playOrder(4, { repeat: [1, 2] })).toEqual([1, 2, 1, 2, 3, 4]));
  it('skips the 1st ending the second time', () => expect(playOrder(4, { repeat: [1, 3], endings: true })).toEqual([1, 2, 3, 1, 2, 4]));
  it('goes D.C. al Coda', () => expect(playOrder(6, { coda: { toCoda: 2, codaAt: 5 } })).toEqual([1, 2, 3, 4, 1, 2, 5, 6]));
  it('combines repeats, endings and a coda', () =>
    expect(playOrder(6, { repeat: [1, 2], endings: true, coda: { toCoda: 3, codaAt: 5 } })).toEqual([1, 2, 1, 3, 4, 1, 3, 5, 6]));
});

describe('expandForm', () => {
  it('copies each bar to where it is played', () => {
    const c: Chart = { title: 'x', bpm: 80, timeSignature: [4, 4], bars: 2, notes: [...pattern({ snare: 'x...' }, 1), ...pattern({ kick: 'x...' }, 1, 1, 4)], form: { repeat: [1, 2] } };
    const e = expandForm(c);
    expect(e.bars).toBe(4);
    expect(e.notes.map(n => `${n.t}${n.drum}`)).toEqual(['0snare', '4kick', '8snare', '12kick']);
    expect(e.form).toBeUndefined();
  });
});
