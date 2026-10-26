import { describe, expect, it } from 'vitest';
import { monthly, youVsYou } from './history';
import type { RunRow } from './progress';

const NOW = Date.parse('2026-10-26T12:00:00Z');
const run = (id: number, daysAgo: number, o: Partial<RunRow & { hasTake: boolean }> = {}) => ({
  id, hasTake: true, chartId: 'rock', chartTitle: 'Rock', startedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(), durationS: 60,
  bpm: 80, speed: 1, accuracy: 80, meanOffset: 10, spread: 30, ...o });

describe('youVsYou', () => {
  it('pairs a take a month old with a recent one of the same bars', () => {
    const r = youVsYou([run(1, 40), run(2, 30), run(3, 20), run(4, 2)], NOW);
    expect([r?.then.id, r?.now.id]).toEqual([2, 4]);
  });
  it('needs both an old and a recent kept take of the same bars', () => {
    expect(youVsYou([run(1, 40), run(2, 2, { hasTake: false })], NOW)).toBeUndefined();
    expect(youVsYou([run(1, 40, { fromBar: 1, toBar: 4 }), run(2, 2, { fromBar: 5, toBar: 8 })], NOW)).toBeUndefined();
  });
  it('picks the exercise played most', () => {
    const r = youVsYou([run(1, 40, { chartId: 'a' }), run(2, 1, { chartId: 'a' }), run(3, 40), run(4, 30), run(5, 3)], NOW);
    expect(r?.now.chartId).toBe('rock');
  });
});

describe('monthly', () => {
  it('sums each month, oldest first', () => {
    const m = monthly([run(1, 1, { accuracy: 90, bpm: 100 }), run(2, 2, { accuracy: 70 }), run(3, 40)], NOW, 3);
    expect(m.map(x => x.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(m[2]).toMatchObject({ takes: 2, minutes: 2, accuracy: 80, bestBpm: 100 });
    expect(m[1].takes).toBe(1);
    expect(m[0]).toMatchObject({ takes: 0, accuracy: 0 });
  });
});
