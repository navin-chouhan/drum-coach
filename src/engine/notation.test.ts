import { describe, expect, it } from 'vitest';
import { pattern } from './chart';
import { durationOf, layoutMeasures, type NotationEvent } from './notation';

const brief = (evs: NotationEvent[]) => evs.map(e => `${e.heads.map(h => h.drum).sort().join('+') || 'rest'}:${e.slots}${e.triplet ? 't' : ''}`);

describe('layoutMeasures', () => {
  it('rock beat: hands in 8ths with the snare in the chord, kick on 1 and 3 with rests', () => {
    const [m] = layoutMeasures(pattern({ hihat: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', kick: 'x.......x.......' }, 4), 4);
    expect(brief(m.hands)).toEqual(['hihat:2', 'hihat:2', 'hihat+snare:2', 'hihat:2', 'hihat:2', 'hihat:2', 'hihat+snare:2', 'hihat:2']);
    expect(brief(m.feet)).toEqual(['kick:4', 'rest:4', 'kick:4', 'rest:4']);
  });
  it('leading rest, dotted 8th + 16th, ghost/accent/open flags', () => {
    const [m] = layoutMeasures([
      { t: 0.25, drum: 'snare', ghost: true }, { t: 1, drum: 'kick' }, { t: 1.75, drum: 'kick' }, { t: 2, drum: 'hhOpen', accent: true },
    ], 4);
    expect(brief(m.hands)).toEqual(['rest:1', 'snare:3', 'rest:4', 'hhOpen:4', 'rest:4']);
    expect(m.hands[1].heads[0]).toMatchObject({ ghost: true, key: 'c/5' });
    expect(m.hands[3].heads[0]).toMatchObject({ accent: true, open: true, key: 'g/5/x2' });
    expect(brief(m.feet)).toEqual(['rest:4', 'kick:3', 'kick:1', 'rest:4', 'rest:4']);
  });
  it('triplets get their own grid; a 6/8 bar has 3 quarter beats', () => {
    const [m] = layoutMeasures(pattern({ snare: 'xxx' }, 3).map(n => ({ ...n })), 4);
    expect(brief(m.hands).slice(0, 3)).toEqual(['snare:1t', 'snare:1t', 'snare:1t']);
    expect(layoutMeasures(pattern({ hihat: 'xxxxxx' }, 2), 3)[0].hands).toHaveLength(6);
  });
  it('one measure per bar up to the last note, or the requested range', () => {
    const notes = [{ t: 0, drum: 'kick' as const }, { t: 9, drum: 'kick' as const }];
    expect(layoutMeasures(notes, 4).map(m => m.index)).toEqual([1, 2, 3]);
    expect(layoutMeasures(notes, 4, 2, 2)[0].feet.every(e => !e.heads.length)).toBe(true);
  });
});

describe('durationOf', () => {
  it('maps grid lengths to note values', () => {
    expect([1, 2, 3, 4].map(slots => durationOf({ heads: [], slots, triplet: false }))).toEqual([
      { duration: '16', dots: 0, inTuplet: false }, { duration: '8', dots: 0, inTuplet: false },
      { duration: '8', dots: 1, inTuplet: false }, { duration: 'q', dots: 0, inTuplet: false }]);
    expect(durationOf({ heads: [], slots: 1, triplet: true })).toEqual({ duration: '8', dots: 0, inTuplet: true });
  });
});
