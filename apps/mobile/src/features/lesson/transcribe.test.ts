import { describe, expect, it } from 'vitest';
import { pattern, type Chart } from '@drum-coach/core/engine/chart';
import { cellKey, cellState, checkGrid, checkLine, gridOf, stepsOf } from './transcribe';

const money: Chart = { title: 'Money', bpm: 70, timeSignature: [4, 4], bars: 2, notes: pattern({ hihat: 'xxxxxxxx', snare: '..x...x.', kick: 'x...x...' }, 2) };

describe('transcription (web src/lesson/Transcribe.tsx)', () => {
  it('the grid: the chart\'s drums top to bottom, 8th steps, the count on top', () => {
    const g = gridOf(money);
    expect(stepsOf(money)).toBe(2);
    expect(g.lanes).toEqual(['hihat', 'snare', 'kick']);
    expect(g.cols).toBe(16);
    expect(g.heads.slice(0, 4)).toEqual(['1', '&', '2', '&']);
    expect(g.answer.has(cellKey('kick', 0))).toBe(true);
    expect(stepsOf({ ...money, notes: [{ t: 0.25, drum: 'snare' }] })).toBe(4);
    expect(gridOf({ ...money, notes: [{ t: 0.25, drum: 'snare' }] }).heads.slice(0, 4)).toEqual(['1', 'e', '&', 'a']);
  });

  it('checks as the web: 80% passes, the line names what\'s missing and extra', () => {
    const g = gridOf(money);
    const all = new Set(g.answer);
    expect(checkGrid(all, money, g.spb)).toMatchObject({ pct: 100, ok: true });
    const some = new Set([...g.answer].slice(0, 10));
    some.add(cellKey('snare', 1));
    const s = checkGrid(some, money, g.spb);
    expect(s).toMatchObject({ right: 10, extra: 1, ok: false });
    expect(checkLine(s)).toBe(`${s.pct}% right: 10 right, ${s.missed} missing, 1 that aren't there. Dotted boxes are missing, red ones are extra. Listen again and fix them.`);
    expect(checkLine({ ...checkGrid(all, money, g.spb) })).toMatch(/You wrote it down by ear!$/);
  });

  it('cells after a check', () => {
    expect([cellState(false, true, true), cellState(true, true, true), cellState(true, true, false), cellState(true, false, true), cellState(true, false, false)])
      .toEqual(['', 'right', 'wrong', 'missed', '']);
  });
});
