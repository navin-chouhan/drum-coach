import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_MAP } from '../engine/kit.ts';
import type { KitCalibration } from '../engine/padCal.ts';
import { createHitBus } from './hits.ts';

// One bus for the file, like the web's singleton: the default note map, a calibration the N9 test sets.
let padCal: KitCalibration = {};
const setPadCal = (c: KitCalibration) => { padCal = c; };
const { emitNote, onHit } = createHitBus({ now: () => 0, getNoteMap: () => DEFAULT_NOTE_MAP, getPadCal: () => padCal });

describe('stick bounces', () => {
  it('drops a softer repeat of the same note within 60 ms, keeps a flam and real strokes', () => {
    const got: number[] = [];
    const off = onHit(h => got.push(h.velocity));
    emitNote(38, 42, 1000); emitNote(38, 21, 1040); // bounce: dropped
    emitNote(38, 20, 2000); emitNote(38, 90, 2030); // flam: grace then louder main note, both kept
    emitNote(38, 50, 3000); emitNote(38, 30, 3070); // 70 ms apart: two strokes
    emitNote(36, 40, 4000); emitNote(38, 30, 4010); // different pads at once
    emitNote(38, 92, 5000); emitNote(38, 80, 5045); // fast singles, weaker hand: a real stroke, kept
    emitNote(38, 67, 6000); emitNote(38, 34, 6040); emitNote(38, 35, 7000); emitNote(38, 22, 7030); // retriggers seen on the kit (51 %, 63 %)
    off();
    expect(got).toEqual([42, 20, 90, 50, 30, 40, 30, 92, 80, 67, 35]);
  });

  it('keeps every stroke of a drag and a ruff (graces about as soft as each other, then a loud main note)', () => {
    const got: number[] = [];
    const off = onHit(h => got.push(h.velocity));
    emitNote(38, 30, 20000); emitNote(38, 28, 20025); emitNote(38, 95, 20050); // drag
    emitNote(38, 30, 21000); emitNote(38, 30, 21025); emitNote(38, 29, 21050); emitNote(38, 95, 21075); // ruff
    off();
    expect(got).toEqual([30, 28, 95, 30, 30, 29, 95]);
  });

  it('a dropped retrigger never becomes the stroke later retriggers are compared with (flams on the MPS-150)', () => {
    const got: number[] = [];
    const off = onHit(h => got.push(h.velocity));
    // grace 33, main 88, the grace's retrigger 18 (dropped), then the main's retrigger 44: dropped too, not an extra
    emitNote(38, 33, 30783); emitNote(38, 88, 30809); emitNote(38, 18, 30822); emitNote(38, 44, 30839);
    off();
    expect(got).toEqual([33, 88]);
  });

  it('drops soft-snare crosstalk on the hi-hat, keeps real hi-hat strokes', () => {
    const got: string[] = [];
    const off = onHit(h => got.push(`${h.note}:${h.velocity}`));
    emitNote(38, 35, 10000); emitNote(46, 31, 10010); // ghost snare, then the hi-hat it triggered ~10 ms later: dropped
    emitNote(38, 30, 11000); emitNote(42, 28, 11009); // same with the pedal down (closed)
    emitNote(38, 35, 12000); emitNote(42, 80, 12005); // a ghost under a real hi-hat stroke: both kept
    emitNote(38, 110, 13000); emitNote(46, 40, 13010); // a backbeat never makes crosstalk: a soft hi-hat after it stays
    emitNote(38, 35, 14000); emitNote(46, 30, 14040); // 40 ms later: a stroke of its own
    off();
    expect(got).toEqual(['38:35', '38:30', '38:35', '42:80', '38:110', '46:40', '38:35', '46:30']);
  });
});

describe('per-pad calibration (N9)', () => {
  it('a calibrated pad uses its own retrigger window and reports velocity on the common scale', () => {
    setPadCal({ snare: { soft: 10, loud: 100, bounceMs: 80, bounceRatio: 0.8 } });
    const got: number[] = [];
    const off = onHit(h => got.push(h.velocity));
    emitNote(38, 100, 50000); emitNote(38, 70, 50075); // a 75 ms retrigger at 70%: this pad's own filter drops it
    emitNote(38, 10, 51000);
    off();
    setPadCal({});
    expect(got).toEqual([120, 30]);
  });
});
