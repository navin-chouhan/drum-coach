import { describe, expect, it } from 'vitest';
import { GRID_ROWS, GRID_ROW_NAME, TRANSCRIBE_PASS, gridStepsOf } from './transcribe';

describe('the note grids (song editor, transcription)', () => {
  it('rows top to bottom with their names, the pass mark, steps per beat', () => {
    expect(GRID_ROWS).toEqual(['crash', 'ride', 'hihat', 'hhOpen', 'hhPedal', 'tom1', 'tom2', 'floor', 'snare', 'kick']);
    expect(GRID_ROWS.map(d => GRID_ROW_NAME[d])).toEqual(['Crash', 'Ride', 'Hi-hat', 'HH open', 'HH foot', 'Tom 1', 'Tom 2', 'Floor', 'Snare', 'Kick']);
    expect(TRANSCRIBE_PASS).toBe(80);
    expect(gridStepsOf({ notes: [{ t: 0.5, drum: 'snare' }] })).toBe(2);
    expect(gridStepsOf({ notes: [{ t: 0.25, drum: 'snare' }] })).toBe(4);
    expect(gridStepsOf({ notes: [{ t: 1 / 3, drum: 'snare' }] })).toBe(3);
    expect(gridStepsOf({ notes: [{ t: 0.2, drum: 'snare' }] })).toBe(4);
  });
});

describe('gridScore (N7)', () => {
  it('scores a written grid against the chart', async () => {
    const { gridScore } = await import('./transcribe');
    const answer = [{ t: 0, drum: 'kick' as const }, { t: 1, drum: 'snare' as const }, { t: 0.5, drum: 'hihat' as const }];
    expect(gridScore(answer, answer, 2).pct).toBe(100);
    expect(gridScore([{ t: 0, drum: 'kick' }, { t: 1, drum: 'snare' }, { t: 1.5, drum: 'snare' }], answer, 2)).toEqual({ right: 2, extra: 1, missed: 1, pct: 50 });
    expect(gridScore([{ t: 0.5, drum: 'hhOpen' }], [{ t: 0.5, drum: 'hihat' }], 2).pct).toBe(100);
  });
});
