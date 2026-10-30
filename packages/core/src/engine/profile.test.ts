import { describe, expect, it } from 'vitest';
import { studentProfile } from './profile';
import type { RunRow } from './progress';

const now = new Date('2026-10-26T20:00:00');
const day = (d: number, h = 18) => new Date(now.getTime() - d * 86_400_000 + (h - 20) * 3_600_000).toISOString();
const run = (d: number, o: Partial<RunRow> = {}): RunRow => ({ chartId: 'lesson/money-8ths/1', chartTitle: 'The money beat', startedAt: day(d), durationS: 120,
  bpm: 70, speed: 1, accuracy: 80, meanOffset: 10, spread: 20, ...o });

describe('studentProfile', () => {
  it('nothing played: an empty profile', () => {
    expect(studentProfile([], now)).toEqual({ days: 0, minutes: 0, perDrum: {}, timing: null, topTips: [], tools: {}, songs: [], weakest: null });
  });
  it('per drum: accuracy and lateness over 28 days, with a trend (last 14 days vs the 14 before, 3+ points, 40+ notes)', () => {
    const runs = [
      ...[20, 18, 16].map(d => run(d, { perDrum: { kick: { notes: 20, accuracyPct: 60, meanOffsetMs: 40 }, snare: { notes: 20, accuracyPct: 90, meanOffsetMs: 5 } } })),
      ...[6, 4, 2].map(d => run(d, { perDrum: { kick: { notes: 20, accuracyPct: 75, meanOffsetMs: 25 }, snare: { notes: 20, accuracyPct: 91, meanOffsetMs: 4 } } })),
      run(40, { perDrum: { kick: { notes: 500, accuracyPct: 0, meanOffsetMs: 0 } } }), // older than 28 days: ignored
    ];
    const p = studentProfile(runs, now);
    expect(p.perDrum.kick).toEqual({ notes: 120, accuracy: 67.5, offset: 32.5, trend: 'better' });
    expect(p.perDrum.snare).toMatchObject({ accuracy: 90.5, trend: 'same' });
    expect(p.weakest).toBe('kick');
    expect(p.days).toBe(6);
  });
  it('top tips in plain words, minutes per tool, favourite songs', () => {
    const runs = [run(1, { tips: ['dragging', 'dragging', 'praise'], tool: 'jam', durationS: 300 }), run(2, { tips: ['dragging', 'missing-kick'], tool: 'drill', durationS: 120 }),
      run(3, { chartId: 'yt-abc', chartTitle: 'Billie Jean', durationS: 600 }), run(4, { chartId: 'rock-8ths', chartTitle: 'Basic rock beat', durationS: 60 })];
    const p = studentProfile(runs, now);
    expect(p.topTips[0]).toEqual({ id: 'dragging', count: 3, words: expect.stringMatching(/behind/) });
    expect(p.topTips.map(t => t.id)).not.toContain('praise');
    expect(p.tools).toEqual({ jam: 5, drill: 2, song: 10, practice: 1 });
    expect(p.songs).toEqual([{ chartId: 'yt-abc', title: 'Billie Jean', minutes: 10 }]);
    expect(p.timing).toMatchObject({ offset: 10, trend: null });
  });
});
