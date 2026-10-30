import { describe, expect, it } from 'vitest';

describe('gridScore (N7)', () => {
  it('scores a written grid against the chart', async () => {
    const { gridScore } = await import('./transcribe');
    const answer = [{ t: 0, drum: 'kick' as const }, { t: 1, drum: 'snare' as const }, { t: 0.5, drum: 'hihat' as const }];
    expect(gridScore(answer, answer, 2).pct).toBe(100);
    expect(gridScore([{ t: 0, drum: 'kick' }, { t: 1, drum: 'snare' }, { t: 1.5, drum: 'snare' }], answer, 2)).toEqual({ right: 2, extra: 1, missed: 1, pct: 50 });
    expect(gridScore([{ t: 0.5, drum: 'hhOpen' }], [{ t: 0.5, drum: 'hihat' }], 2).pct).toBe(100);
  });
});
