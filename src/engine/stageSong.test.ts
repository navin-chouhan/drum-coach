import { describe, expect, it } from 'vitest';
import { CURRICULUM, LESSON_BY_ID, MILESTONES } from '../content/curriculum';
import { chordMidi } from './band';
import { barsReady, type RunRow } from './progress';
import { biteLesson, stageSong } from './stageSong';

describe('a song at the centre of every stage (R8)', () => {
  it('every stage has a built-in song of 8+ bars with a chord line that parses', () => {
    for (const m of MILESTONES) {
      const song = stageSong(m.level, CURRICULUM)!;
      expect(song, `stage ${m.level + 1}`).toBeDefined();
      expect(song.steps.at(-1)!.chart.bars).toBeGreaterThanOrEqual(8);
      for (const c of song.band!.chords!.split(' ')) expect(() => chordMidi(c)).not.toThrow();
    }
  });
  it('a 16-bar song is learned in 4-bar bites; each step is those bars of the song, tagged with where they come from', () => {
    const song = LESSON_BY_ID['song-steady'], bites = biteLesson(song)!;
    expect(bites.id).toBe('bite-song-steady');
    expect(bites.steps.map(s => [s.bite!.fromBar, s.bite!.toBar])).toEqual([[1, 4], [5, 8], [9, 12], [13, 16]]);
    expect(bites.steps[0].chart.bars).toBe(4);
    expect(bites.steps[1].chart.notes.length).toBeGreaterThan(0);
    expect(bites.level).toBe(song.level);
    expect(biteLesson(LESSON_BY_ID['song-first'])).toBeUndefined(); // 8 bars: learn it whole
    expect(biteLesson(LESSON_BY_ID['song-garage'])!.steps).toHaveLength(3); // 24 bars: 8-bar bites
  });
  it('bite takes count towards the song\'s bars ready, and so do takes of the song lesson', () => {
    const run = (o: Partial<RunRow>): RunRow => ({ chartId: 'x', chartTitle: 'x', startedAt: '2026-10-20T10:00:00', durationS: 60, bpm: 80, speed: 1, accuracy: 90, meanOffset: 0, spread: 10, ...o });
    const runs = [run({ chartId: 'lesson/bite-song-steady/1', bite: { songId: 'song-steady', fromBar: 1, toBar: 4 } }),
      run({ chartId: 'lesson/bite-song-steady/2', bite: { songId: 'song-steady', fromBar: 5, toBar: 8 }, accuracy: 70 }),
      run({ chartId: 'lesson/song-steady/1', fromBar: 1, toBar: 16, accuracy: 80 })];
    expect(barsReady(runs, 'song-steady', 16)).toBe(4);
    expect(barsReady([...runs, run({ chartId: 'lesson/song-steady/1', fromBar: 1, toBar: 16 })], 'song-steady', 16)).toBe(16);
  });
});
