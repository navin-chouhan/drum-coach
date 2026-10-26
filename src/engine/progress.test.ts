import { describe, expect, it } from 'vitest';
import { barsReady, dashboard, earnedBadges, songReady, forYou, isoWeek, suggestNext, weekRecap, weekTheme, type RunRow } from './progress';

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

describe('earnedBadges', () => {
  const now = new Date('2026-10-24T18:00:00');
  it('earns from runs and lesson progress', () => {
    const runs = [run({ startedAt: '2026-10-24T09:00:00', bpm: 104, accuracy: 92, notes: 600 }), run({ startedAt: '2026-10-24T10:00:00', chartId: 'yt-abc', accuracy: 90, notes: 600 })];
    expect(earnedBadges(runs, { a: { stars: 3 }, b: { stars: 3 } }, [['a', 'b'], ['c']], now, ['yt-abc'])).toEqual(['first-3star', 'fast-100', 'notes-1k', 'showoff', 'stage-3star']);
    expect(earnedBadges(runs, {}, [], now)).not.toContain('showoff'); // a good take isn't enough: the song must be ready
    expect(earnedBadges([], { a: { stars: 2 } }, [[]], now)).toEqual([]);
  });
});

describe('streak badges (fake dates)', () => {
  it('7 days in a row earn the 7-day streak, a gap breaks it', () => {
    const now = new Date('2026-10-26T20:00:00');
    const days = (n: number, skip = -1) => Array.from({ length: n }, (_, i) => i).filter(i => i !== skip).map(i => run({ startedAt: new Date(now.getTime() - i * 86_400_000).toISOString(), notes: 10 }));
    expect(earnedBadges(days(7), {}, [], now)).toContain('streak-7');
    expect(earnedBadges(days(7, 3), {}, [], now)).not.toContain('streak-7');
    expect(earnedBadges(days(30), {}, [], now)).toContain('streak-30');
  });
});

describe('songReady', () => {
  it('a show-off song is 16 bars or more, every bar at 85%+', () => {
    const two = [run({ chartId: 'yt-a', accuracy: 99, fromBar: 1, toBar: 2 })];
    expect(songReady(two, 'yt-a', 2)).toBe(false); // a 2-bar song doesn't count
    const sixteen = [run({ chartId: 'yt-a', accuracy: 90, fromBar: 1, toBar: 8 }), run({ chartId: 'yt-a', accuracy: 86, fromBar: 9, toBar: 16 })];
    expect(songReady(sixteen, 'yt-a', 16)).toBe(true);
    expect(songReady(sixteen, 'yt-a', 24)).toBe(false); // bars 17–24 not ready yet
  });
});

describe('barsReady', () => {
  it('counts bars covered by 85%+ takes of that song, overlaps once', () => {
    const runs = [run({ chartId: 'yt-a', accuracy: 90, fromBar: 1, toBar: 4 }), run({ chartId: 'yt-a', accuracy: 88, fromBar: 3, toBar: 6 }),
      run({ chartId: 'yt-a', accuracy: 70, fromBar: 7, toBar: 9 }), run({ chartId: 'yt-b', accuracy: 99, fromBar: 7, toBar: 9 }), run({ chartId: 'yt-a', accuracy: 99 })];
    expect(barsReady(runs, 'yt-a', 24)).toBe(6);
    expect(barsReady(runs, 'yt-a', 5)).toBe(5);
  });
});

describe('forYou', () => {
  const charts = [{ id: 'a', kind: 'groove', level: 1 }, { id: 'r', kind: 'rudiment', level: 1 }, { id: 'n', kind: 'groove', level: 2 }, { id: 'x', kind: 'fill', level: 2 }, { id: 'ai1', source: 'ai' }];
  it('recent first, then the coach, a warm-up, and new at this level', () => {
    const picks = forYou(charts, [run({ chartId: 'n' }), run({ chartId: 'a' })], 2);
    expect(picks.map(p => `${p.chart.id}:${p.why}`)).toEqual(['a:played lately', 'n:played lately', 'ai1:from your coach', 'r:good warm-up', 'x:at your level']);
    expect(forYou(charts, [], 1).map(p => `${p.chart.id}:${p.why}`)).toEqual(['ai1:from your coach', 'r:good warm-up', 'a:at your level', 'n:a step up', 'x:a step up']);
    expect(forYou(charts, [], 2, 2)).toHaveLength(2);
  });
  it('above the library top level, "at your level" is the highest level below it', () => {
    expect(forYou(charts, [], 6).map(p => `${p.chart.id}:${p.why}`)).toEqual(['ai1:from your coach', 'r:good warm-up', 'n:at your level', 'x:at your level']);
  });
});

describe('weekTheme', () => {
  const now = new Date('2026-10-24T18:00:00');
  it('picks the tip given most this week, 3+ times, praise aside', () => {
    const runs = [run({ startedAt: '2026-10-23T09:00:00', tips: ['rushing', 'praise', 'praise', 'praise', 'praise'] }), run({ startedAt: '2026-10-24T09:00:00', tips: ['rushing', 'rushing', 'dragging'] }),
      run({ startedAt: '2026-10-10T09:00:00', tips: ['dragging', 'dragging', 'dragging'] })];
    expect(weekTheme(runs, now)).toEqual({ cue: 'rushing', count: 3, words: 'rushing ahead of the click' });
    expect(weekTheme(runs.slice(1), now)).toBeNull();
    expect(weekTheme([run({ startedAt: '2026-10-24T09:00:00', tips: ['missing-snare', 'missing-snare', 'missing-snare'] })], now)?.words).toBe('the snare');
    expect(weekTheme([run({ startedAt: '2026-10-24T09:00:00', tips: ['missing-hhOpen', 'missing-hhOpen', 'missing-hhOpen'] })], now)?.words).toBe('the open hi-hat');
  });
  it('forgets a habit that is fixed: it has to show up in the last 5 takes too', () => {
    const early = [1, 2, 3].map(i => run({ startedAt: `2026-10-20T09:0${i}:00`, tips: ['dragging', 'dragging'] }));
    const clean = [1, 2, 3, 4, 5].map(i => run({ startedAt: `2026-10-23T09:0${i}:00`, tips: ['praise'] }));
    expect(weekTheme([...early, ...clean], now)).toBeNull();
    const rushing = [1, 2, 3].map(i => run({ startedAt: `2026-10-22T09:0${i}:00`, tips: ['rushing'] }));
    // dragging is the most given, but only rushing is still around lately
    expect(weekTheme([...early, ...rushing, ...clean.slice(1)], now)?.cue).toBe('rushing');
    expect(weekTheme([...clean.slice(1), ...early.reverse()], now)?.cue).toBe('dragging'); // order of the rows doesn't matter
  });
});

describe('weekly recap', () => {
  it('names the ISO week (the Thursday decides the year)', () => {
    expect(isoWeek(new Date('2026-10-26T10:00:00'))).toBe('2026-W44');
    expect(isoWeek(new Date('2027-01-01T10:00:00'))).toBe('2026-W53');
  });
  it('is three plain sentences', () => {
    expect(weekRecap({ minutesWeek: 42.4, landedWeek: 81, landedLastWeek: 74 }, '7-day streak'))
      .toBe('Last week you played 42 minutes. Your notes landed 81% of the time, up from 74%. New on your shelf: 7-day streak.');
    expect(weekRecap({ minutesWeek: 0, landedWeek: null, landedLastWeek: null })).toMatch(/^Last week was a quiet one/);
  });
});
