import { describe, expect, it } from 'vitest';
import { dashboard, suggestNext, type RunRow } from './progress';

const catalog = [
  { id: 'a', title: 'A', bpm: 80, level: 1 },
  { id: 'b', title: 'B', bpm: 100, level: 2 },
];
const run = (p: Partial<RunRow>): RunRow => ({
  chartId: 'a', chartTitle: 'A', startedAt: '2026-10-20T10:00:00', durationS: 300, bpm: 80, speed: 1, accuracy: 80, meanOffset: 0, spread: 10, ...p,
});

describe('suggestNext', () => {
  it('starts with the easiest chart at 80%', () => {
    expect(suggestNext([], catalog)).toMatchObject({ chartId: 'a', bpm: 64 });
  });
  it('speeds up after two runs above 90% at the same tempo', () => {
    expect(suggestNext([run({ accuracy: 92 }), run({ accuracy: 95 })], catalog)).toMatchObject({ chartId: 'a', bpm: 85 });
    expect(suggestNext([run({ accuracy: 92, bpm: 75 }), run({ accuracy: 95 })], catalog).bpm).toBe(80); // different tempos: keep
  });
  it('moves to the next level at the 125% cap', () => {
    expect(suggestNext([run({ accuracy: 95, bpm: 98 }), run({ accuracy: 96, bpm: 98 })], catalog)).toMatchObject({ chartId: 'b', bpm: 80 });
  });
  it('slows down below 70%, not under half speed', () => {
    expect(suggestNext([run({ accuracy: 60 })], catalog).bpm).toBe(70);
    expect(suggestNext([run({ accuracy: 60, bpm: 42 })], catalog).bpm).toBe(40);
  });
});

describe('dashboard', () => {
  const now = new Date('2026-10-24T18:00:00');
  it('counts the streak, including when today has no practice yet', () => {
    const runs = ['2026-10-21', '2026-10-22', '2026-10-23'].map(d => run({ startedAt: `${d}T09:00:00` }));
    expect(dashboard(runs, now).streak).toBe(3);
    expect(dashboard([...runs, run({ startedAt: '2026-10-24T09:00:00' })], now).streak).toBe(4);
    expect(dashboard([run({ startedAt: '2026-10-20T09:00:00' })], now).streak).toBe(0);
    const d = dashboard([run({ startedAt: '2026-10-12T09:00:00', accuracy: 60 }), run({ startedAt: '2026-10-24T09:00:00', accuracy: 80 }), run({ startedAt: '2026-10-23T09:00:00', accuracy: 90 })], now);
    expect([d.landedWeek, d.landedLastWeek]).toEqual([85, 60]);
  });
  it('sums minutes and tracks the best tempo at 90%+', () => {
    const d = dashboard([
      run({ startedAt: '2026-10-24T09:00:00', accuracy: 91, bpm: 85 }),
      run({ startedAt: '2026-10-24T10:00:00', durationS: 600, accuracy: 70, bpm: 90 }),
    ], now);
    expect(d.minutesToday).toBe(15);
    expect(d.days[13]).toEqual({ date: '2026-10-24', minutes: 15 });
    expect(d.charts[0]).toMatchObject({ chartId: 'a', runs: 2, best90Bpm: 85, lastAccuracy: 70 });
  });
});
