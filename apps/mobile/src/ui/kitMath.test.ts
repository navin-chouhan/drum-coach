import { describe, expect, it } from 'vitest';
import { barHeight, digitsOnly, dotPositions, percent, rungLooks, splitHost, stepBounds, stepValue } from './kitMath';

describe('Stepper', () => {
  it('steps and clamps', () => {
    expect(stepValue(38, 1)).toBe(39);
    expect(stepValue(0, -1, { min: 0, max: 127 })).toBe(0);
    expect(stepValue(127, 1, { min: 0, max: 127 })).toBe(127);
    expect(stepValue(100, 1, { step: 5, max: 125 })).toBe(105);
    expect(stepValue(0.15, 1, { step: 0.05 })).toBe(0.2);
    expect(stepBounds(1, 1, 9)).toEqual({ down: false, up: true });
    expect(stepBounds(5)).toEqual({ down: true, up: true });
  });
});

describe('Field', () => {
  it('keeps digits only, up to three by default', () => {
    expect(digitsOnly('2a0x5 9')).toBe('205');
    expect(digitsOnly('12', 1)).toBe('1');
  });
});

describe('charts', () => {
  it('scales bars and tracks', () => {
    expect(barHeight(50, 100, 80)).toBe(40);
    expect(barHeight(150, 100, 80)).toBe(80);
    expect(barHeight(-3, 100, 80)).toBe(0);
    expect(barHeight(0.5, 0, 80)).toBe(40);
    expect(percent(0.25)).toBe('25%');
    expect(percent(2)).toBe('100%');
  });
  it('places sparkline dots', () => {
    expect(dotPositions([50])).toEqual([{ left: 56, bottom: 11 }]);
    expect(dotPositions([0, 100])).toEqual([{ left: 0, bottom: 0 }, { left: 112, bottom: 22 }]);
  });
});

describe('TempoLadder', () => {
  it('colours rungs below, on and above the one you are on', () => {
    const looks = rungLooks([
      { bpm: 60, at: false, start: true, goal: false },
      { bpm: 65, at: true, start: false, goal: false },
      { bpm: 70, at: false, start: false, goal: true },
    ]);
    expect(looks.map(l => l.fill)).toEqual(['done', 'at', 'goal']);
    expect(looks.map(l => l.dashed)).toEqual([false, false, false]);
    expect(looks.map(l => l.height)).toEqual([9, 18, 27]);
    expect(rungLooks([{ bpm: 60, at: false, start: true, goal: false }])[0]).toMatchObject({ dashed: true, fill: 'none', height: 9 });
  });
});

describe('coach offline card', () => {
  it('splits the host out of a line', () => {
    expect(splitHost('Is the coach server on at drum.local:8787?', 'drum.local:8787')).toEqual({ before: 'Is the coach server on at ', host: 'drum.local:8787', after: '?' });
    expect(splitHost('No host here', 'x.local')).toBeNull();
    expect(splitHost('anything')).toBeNull();
  });
});
