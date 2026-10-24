import { describe, expect, it } from 'vitest';
import { emitNote, onHit } from './hits';

describe('stick bounces', () => {
  it('drops a softer repeat of the same note within 60 ms, keeps a flam and real strokes', () => {
    const got: number[] = [];
    const off = onHit(h => got.push(h.velocity));
    emitNote(38, 42, 1000); emitNote(38, 21, 1040); // bounce: dropped
    emitNote(38, 20, 2000); emitNote(38, 90, 2030); // flam: grace then louder main note, both kept
    emitNote(38, 50, 3000); emitNote(38, 30, 3070); // 70 ms apart: two strokes
    emitNote(36, 40, 4000); emitNote(38, 30, 4010); // different pads at once
    off();
    expect(got).toEqual([42, 20, 90, 50, 30, 40, 30]);
  });
});
