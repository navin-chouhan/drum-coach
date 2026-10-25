import { describe, expect, it } from 'vitest';
import { scoreJam } from './jam';
import { alignPhase, fitBeatGrid, songSecAt } from './tempo';
import { cutBars, quantizeTake, replaceRange, songChart, takeChart, toggleNote } from './transcribe';
import { parseYouTubeId } from './youtube';

describe('parseYouTubeId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'dQw4w9WgXcQ'],
    ['youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://vimeo.com/123', null],
    ['not a link', null],
  ])('%s', (input, id) => expect(parseYouTubeId(input)).toBe(id));
});

describe('fitBeatGrid', () => {
  // 120 BPM, downbeat at 1.3 s; taps jitter ±10 ms and one beat is skipped
  const taps = [0, 1, 2, 3, 4, 6, 7, 8, 9].map((k, i) => 1.3 + k * 0.5 + (i % 2 ? 0.01 : -0.01));
  it('recovers tempo and phase despite jitter and a skipped tap', () => {
    const g = fitBeatGrid(taps)!;
    expect(g.bpm).toBeCloseTo(120, 0);
    expect(g.offsetSec).toBeCloseTo(1.3, 1);
    expect(g.residualMs).toBeLessThan(15);
  });
  it('moves beat 0 back by whole bars only', () => {
    const g = fitBeatGrid(taps.map(t => t + 4))!; // first tap at 5.3 s → 5.3 − 2 bars (4 s) = 1.3
    expect(g.offsetSec).toBeCloseTo(1.3, 1);
  });
  it('needs at least 4 sane taps', () => {
    expect(fitBeatGrid([1, 2, 3])).toBeNull();
    expect(fitBeatGrid([1, 1.05, 1.1, 1.15])).toBeNull();
  });
});

describe('alignPhase', () => {
  it('finds the downbeat for a known tempo', () => {
    expect(alignPhase([3.31, 3.79, 4.3, 4.81], 120)?.offsetSec).toBeCloseTo(1.3, 1);
  });
});

describe('scoreJam', () => {
  const grid = { bpm: 120, offsetSec: 1 };
  const steady = Array.from({ length: 96 }, (_, i) => ({ songSec: songSecAt(i / 2, grid) - 0.02, pad: 'hhClosed' as const, velocity: 80 }));
  it('measures rushing against the nearest 8th', () => {
    const s = scoreJam(steady, grid, 2);
    expect(s).toMatchObject({ hits: 96, meanOffset: -20, spread: 0, onGridPct: 100, perfectPct: 100, driftMsPerMin: 0 });
    expect(s.perDrum.hhClosed).toMatchObject({ hits: 96, velCv: 0 });
    expect(scoreJam(steady.slice(0, 16), grid, 2).driftMsPerMin).toBeNull(); // 8 s is too short to call a trend
  });
  it('detects drift (getting later over time)', () => {
    const dragging = steady.map((h, i) => ({ ...h, songSec: h.songSec + i * 0.0005 }));
    expect(scoreJam(dragging, grid, 2).driftMsPerMin).toBeGreaterThan(100);
  });
  it('reports real milliseconds at half speed', () => {
    expect(scoreJam(steady, grid, 2, 0.5).meanOffset).toBe(-40);
    // 2 ms later per hit, 4 hits per song-second → 8 ms per song-second; at half speed a real minute is 30 song-seconds
    // 0.5 ms later per hit, 4 hits per song-second = 2 ms/song-s = 4 real ms at half speed; 30 song-s per real minute → 120 ms/min
    const dragging = steady.map((h, i) => ({ ...h, songSec: h.songSec + i * 0.0005 }));
    expect(scoreJam(dragging, grid, 2, 0.5).driftMsPerMin).toBeCloseTo(120, -1);

  });
});

describe('transcription', () => {
  it('quantizes a take to 16ths inside the range and maps pads', () => {
    const take = quantizeTake([
      { beat: 3.97, pad: 'kick', velocity: 90 }, { beat: 4.02, pad: 'hhClosed', velocity: 120 },
      { beat: 4.01, pad: 'hhClosed', velocity: 80 }, { beat: 5.26, pad: 'snare', velocity: 30 }, { beat: 8.1, pad: 'snare', velocity: 80 },
    ], 4, 8);
    expect(take).toEqual([{ t: 4, drum: 'kick' }, { t: 4, drum: 'hihat', accent: true }, { t: 5.25, drum: 'snare', ghost: true }]);
  });
  it('replaces only the chosen bars and toggles notes', () => {
    const notes = [{ t: 0, drum: 'kick' as const }, { t: 4, drum: 'kick' as const }, { t: 8, drum: 'kick' as const }];
    expect(replaceRange(notes, [{ t: 5, drum: 'snare' }], 4, 8).map(n => n.t)).toEqual([0, 5, 8]);
    expect(toggleNote(notes, 4, 'kick')).toHaveLength(2);
    expect(toggleNote(notes, 4.5, 'snare')).toHaveLength(4);
  });
});

describe('takeChart', () => {
  it('keeps real timing and extras, drops count-in and overflow, maps pads to drums', () => {
    const take = { zero: 1000, beatMs: 500, beats: 8, beatsPerBar: 4, title: 'T', timeSignature: [4, 4] as [number, 4] };
    const c = takeChart([{ time: 1520, pad: 'hhClosed', velocity: 120 }, { time: 900, pad: 'snare', velocity: 90 }, { time: 1260, velocity: 30 }, { time: 5100, pad: 'kick', velocity: 90 }], take);
    expect(c).toMatchObject({ bpm: 120, bars: 2 });
    expect(c.notes).toEqual([{ t: 0.52, drum: 'snare', ghost: true }, { t: 1.04, drum: 'hihat', accent: true }]);
  });
});

describe('cutBars', () => {
  it('keeps the bars asked for and moves them to beat 0', () => {
    const notes = [{ t: 3.5, drum: 'kick' as const }, { t: 4, drum: 'snare' as const }, { t: 11.5, drum: 'hihat' as const }, { t: 12, drum: 'crash' as const }];
    expect(cutBars(notes, 4, 2, 3)).toEqual([{ t: 0, drum: 'snare' }, { t: 7.5, drum: 'hihat' }]);
  });
});

describe('songChart', () => {
  it('is the whole song in order, at its grid tempo', () => {
    const c = songChart({ title: 'S', originalId: 'v', timeSignature: [4, 4], grids: { v: { bpm: 96.4 } },
      notes: [{ t: 4.5, drum: 'snare' }, { t: 0, drum: 'kick' }, { t: -1, drum: 'crash' }] });
    expect(c).toMatchObject({ bpm: 96, bars: 2, notes: [{ t: 0, drum: 'kick' }, { t: 4.5, drum: 'snare' }] });
  });
});
