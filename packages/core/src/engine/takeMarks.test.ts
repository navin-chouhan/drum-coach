import { describe, expect, it } from 'vitest';
import { buildRun } from './run';
import { lastRound, markOf } from './takeMarks';
import type { Chart } from './chart';
import type { NoteResult } from './scoring';

const chart: Chart = { id: 'c', title: 'Quarters', bpm: 60, timeSignature: [4, 4], bars: 2,
  notes: [0, 1, 2, 3, 4, 5, 6, 7].map(t => ({ t, drum: 'snare' as const })) };

describe('markOf', () => {
  it('says on it, a hair late, early or missed', () => {
    expect(markOf({ judgement: 'perfect', offset: 12 })).toEqual({ word: 'on it', tone: 'good' });
    expect(markOf({ judgement: 'good', offset: 30 })).toEqual({ word: 'a hair late', tone: 'ok' });
    expect(markOf({ judgement: 'good', offset: -95 })).toEqual({ word: 'early', tone: 'ok' });
    expect(markOf({ judgement: 'miss' })).toEqual({ word: 'missed', tone: 'bad' });
  });
});

describe('lastRound', () => {
  it("maps the last of two rounds onto the chart's notes, with its extra hits", () => {
    const run = buildRun(chart, { fromBar: 1, toBar: 2, repeats: 2 });
    // round 1 all perfect; round 2: note 3 (index 11) missed, the rest late
    const results: NoteResult[] = run.notes.map((n, k) => (k < 8 ? { judgement: 'perfect', offset: 0 } : k === 11 ? { judgement: 'miss' } : { judgement: 'good', offset: 100 }));
    const { marks, extras, rounds } = lastRound(chart, run, results, { fromBar: 1, toBar: 2, repeats: 2 }, [1.5, 9.5]);
    expect(rounds).toBe(2);
    expect(marks.size).toBe(8);
    expect(marks.get(3)?.word).toBe('missed');
    expect(marks.get(0)?.word).toBe('late');
    expect(extras).toEqual([1.5]); // the round-1 extra at 1.5 isn't shown; 9.5 is beat 1.5 of the last round
    const all = lastRound(chart, run, results, { fromBar: 1, toBar: 2, repeats: 2 }, []);
    expect(all.offsets).toHaveLength(15); // the timing line has every round's hits
    expect(all.missed).toBe(1);
  });
  it("leaves the app's notes unmarked", () => {
    const two: Chart = { ...chart, bars: 1, notes: [{ t: 0, drum: 'kick' }, { t: 0, drum: 'snare' }] };
    const run = buildRun(two, { fromBar: 1, toBar: 1, repeats: 1 });
    const { marks } = lastRound(two, run, run.notes.map(() => ({ judgement: 'perfect', offset: 0 })), { fromBar: 1, toBar: 1, repeats: 1, activeLanes: ['snare'] }, []);
    expect([...marks.keys()]).toEqual([1]);
  });
});
