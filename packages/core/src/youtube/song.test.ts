import { describe, expect, it } from 'vitest';
import type { YtSong } from './schemas';
import { songBarCount, songVerified } from './song';

const song = (o: Partial<YtSong>): YtSong => ({ id: 'yt-a', title: 'A', originalId: 'abc', drumlessId: null, coverId: null, timeSignature: [4, 4], notes: [], grids: {}, ...o });

describe('song facts (web api.ts, iPad songsModel)', () => {
  it('checked by ear only with a date', () => {
    expect(songVerified(song({}))).toBe(false);
    expect(songVerified(song({ verifiedAt: null }))).toBe(false);
    expect(songVerified(song({ verifiedAt: '2026-10-31' }))).toBe(true);
  });

  it('bars the notes reach, in the song\'s meter', () => {
    expect(songBarCount(song({}))).toBe(0);
    expect(songBarCount(song({ notes: [{ t: 0, drum: 'kick' }, { t: 7.5, drum: 'snare' }] }))).toBe(2);
    expect(songBarCount(song({ timeSignature: [3, 4], notes: [{ t: 6, drum: 'kick' }] }))).toBe(3);
  });
});
