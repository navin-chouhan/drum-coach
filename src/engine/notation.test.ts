import { describe, expect, it } from 'vitest';
import { pattern } from './chart';
import { durationOf, layoutMeasures, xAtBeat, type NotationEvent, limbPlan, noteHints } from './notation';

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

describe('sheet player helpers', () => {
  it('events know their start beat and which source note each head came from', () => {
    const [m] = layoutMeasures([{ t: 4, drum: 'kick', i: 7 }, { t: 4.5, drum: 'snare', i: 8 }], 4, 2, 2);
    expect(m.feet[0]).toMatchObject({ beat: 4, heads: [{ drum: 'kick', i: 7 }] });
    expect(m.hands.map(e => e.beat)).toEqual([4, 4.5, 5, 6, 7]);
  });
  it('cursor x moves linearly between drawn beats and stops at the ends', () => {
    const pts = [{ beat: 0, x: 100 }, { beat: 1, x: 140 }, { beat: 4, x: 400 }];
    expect(xAtBeat(pts, 0.5)).toBe(120);
    expect(xAtBeat(pts, 2.5)).toBe(270);
    expect(xAtBeat(pts, -1)).toBe(100);
    expect(xAtBeat(pts, 9)).toBe(400);
  });
});

describe('durationOf', () => {
  it('maps grid lengths to note values', () => {
    expect([1, 2, 3, 4].map(slots => durationOf({ heads: [], slots, triplet: false, beat: 0 }))).toEqual([
      { duration: '16', dots: 0, inTuplet: false }, { duration: '8', dots: 0, inTuplet: false },
      { duration: '8', dots: 1, inTuplet: false }, { duration: 'q', dots: 0, inTuplet: false }]);
    expect(durationOf({ heads: [], slots: 1, triplet: true, beat: 0 })).toEqual({ duration: '8', dots: 0, inTuplet: true });
  });
});

describe('noteHints', () => {
  it('counts 8ths and names the limbs of the money beat', () => {
    const notes = [0, 0.5, 1, 1.5].map(t => ({ t, drum: 'hihat' })).concat([{ t: 0, drum: 'kick' }, { t: 1, drum: 'snare' }]);
    expect(noteHints(notes, 4)).toEqual([{ t: 0, count: '1', limbs: 'R+K' }, { t: 0.5, count: '&', limbs: 'R' }, { t: 1, count: '2', limbs: 'R+L' }, { t: 1.5, count: '&', limbs: 'R' }]);
  });
  it("an app-played hi-hat still makes the snare the left hand, and isn't labelled", () => {
    const notes = [0, 1, 2, 3].map(t => ({ t, drum: 'hihat', mine: false })).concat([{ t: 1, drum: 'snare', mine: true }, { t: 3, drum: 'snare', mine: true }, { t: 0, drum: 'kick', mine: true }]);
    expect(noteHints(notes, 4).map(h => `${h.count}:${h.limbs}`)).toEqual(['1:K', '2:L', '4:L']);
  });
  it('alternates singles from R each bar, counts 16ths and triplets, names the hi-hat foot', () => {
    expect(noteHints([0, 0.25, 0.5, 0.75, 4].map(t => ({ t, drum: 'snare' })), 4).map(h => `${h.count}${h.limbs}`)).toEqual(['1R', 'eL', '&R', 'aL', '1R']);
    expect(noteHints([{ t: 1 / 3, drum: 'tom1' }, { t: 1, drum: 'hhPedal' }], 4).map(h => `${h.count}:${h.limbs}`)).toEqual(['trip:R', '2:H']);
  });
});

describe('limbPlan', () => {
  it('says who plays what in the money beat', () => {
    const notes = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map(t => ({ t, drum: 'hihat' })).concat([{ t: 0, drum: 'kick' }, { t: 2, drum: 'kick' }, { t: 1, drum: 'snare' }, { t: 3, drum: 'snare' }, { t: 4, drum: 'kick' }]);
    expect(limbPlan(notes, 4)).toEqual([
      { limb: 'R', name: 'right hand', drums: ['hi-hat'], when: 'every 8th' },
      { limb: 'L', name: 'left hand', drums: ['snare'], when: '2 and 4' },
      { limb: 'K', name: 'right foot', drums: ['kick'], when: '1 and 3' },
    ]);
  });
  it('alternating singles on the snare use both hands', () => {
    expect(limbPlan([0, 1, 2, 3].map(t => ({ t, drum: 'snare' })), 4).map(p => `${p.limb}:${p.when}`)).toEqual(['R:1 and 3', 'L:2 and 4']);
  });
});

describe('grace notes (R2)', () => {
  it('heads carry their grace strokes; hints name the grace hand in small letters (lR rL, llR for a drag)', () => {
    const [m] = layoutMeasures(pattern({ snare: 'f.f.d...' }, 2), 4);
    expect(m.hands.filter(e => e.heads.length).map(e => e.heads[0].grace)).toEqual([1, 1, 2]);
    expect(noteHints(pattern({ snare: 'f.f.d...' }, 2), 4).map(h => h.limbs)).toEqual(['lR', 'rL', 'llR']);
  });
});

describe('left-handed (N9)', () => {
  it('hints and the limb plan swap hands; feet stay', () => {
    const notes = [0, 0.5, 1, 1.5].map(t => ({ t, drum: 'hihat' })).concat([{ t: 0, drum: 'kick' }, { t: 1, drum: 'snare' }]);
    expect(noteHints(notes, 4, true).map(h => h.limbs)).toEqual(['L+K', 'L', 'L+R', 'L']);
    expect(limbPlan(notes, 4, true).map(p => `${p.limb}:${p.name}:${p.drums.join('/')}`)).toEqual(['R:right hand:snare', 'L:left hand:hi-hat', 'K:right foot:kick']);
  });
});
