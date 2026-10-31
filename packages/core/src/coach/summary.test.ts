import { describe, expect, it } from 'vitest';
import type { RunStats } from '../engine/scoring';
import { summarizeTake, type SummaryTake } from './summary';

const cell = (total: number, miss: number, meanAbsOffset: number) => ({ total, miss, meanAbsOffset });
const stats = {
  total: 16, accuracy: 81, perfect: 9, good: 4, miss: 3, extra: 1, meanOffset: 12, spread: 18,
  perDrum: { snare: { total: 8, accuracy: 75, meanOffset: 20 } }, velocity: { normalMean: 90 },
  heat: [cell(4, 0, 5), cell(0, 0, 0), cell(4, 2, 30), cell(4, 1, 10)],
} as unknown as RunStats;
const take = (o: Partial<SummaryTake> = {}): SummaryTake => ({
  stats, run: { beatsPerBar: 1 }, chart: { title: 'Rock beat', bpm: 100, timeSignature: [4, 4], bars: 1, notes: [], kind: 'groove', level: 2, id: 'rock' } as never,
  cues: [], options: { speed: 0.8, fromBar: 1, toBar: 2, repeats: 3 }, ...o,
});

describe('summarizeTake (the coach\'s view of a take; web summarizeRun, iPad summarizeTake)', () => {
  it('the exercise, tempo, section, scores and the three weakest spots', () => {
    const s = summarizeTake(take());
    expect(s.exercise).toEqual({ id: 'rock', title: 'Rock beat', kind: 'groove', level: 2, timeSignature: '4/4' });
    expect(s.tempo).toEqual({ bpm: 80, chartBpm: 100, speedPct: 80 });
    expect(s.section).toEqual({ fromBar: 1, toBar: 2, repeats: 3 });
    expect(s).toMatchObject({ notes: 16, accuracyPct: 81, perfect: 9, good: 4, missed: 3, extraHits: 1, meanOffsetMs: 12, spreadMs: 18 });
    expect(s.perDrum).toEqual({ snare: { notes: 8, accuracyPct: 75, meanOffsetMs: 20 } });
    expect(s.weakSpots.map(w => w.missed)).toEqual([2, 1, 0]); // empty cells left out, worst first
    expect('lesson' in s || 'liveTips' in s || 'graceNotes' in s).toBe(false);
  });

  it('the chart id and lesson from the extras, the live tips when there were any', () => {
    const s = summarizeTake(take({ cues: [{ id: 'rush', text: 'Ease off' }] }), { chartId: 'lesson/x/1', lesson: { id: 'x' } });
    expect(s.exercise.id).toBe('lesson/x/1');
    expect(s.lesson).toEqual({ id: 'x' });
    expect(s).toMatchObject({ liveTips: ['Ease off'], tipIds: ['rush'] });
  });
});
