import { describe, expect, it } from 'vitest';
import { CALIBRATION_ORDER, back, calibrate, initialCal, skip, type CalState } from './calibration';

const feed = (s: CalState, notes: number[], start = 0) =>
  notes.reduce((st, n, i) => calibrate(st, n, start + i * 1000), s);

describe('calibration wizard', () => {
  it('captures one note per pad in order', () => {
    const s = feed(initialCal(), [36, 38, 46, 44, 42, 48, 45, 43, 49, 51]);
    expect(s.step).toBe(CALIBRATION_ORDER.length);
    expect(s.captured).toEqual({ kick: 36, snare: 38, hhOpen: 46, hhPedal: 44, hhClosed: 42, tom1: 48, tom2: 45, floor: 43, crash: 49, ride: 51 });
  });

  it('ignores double triggers within the debounce window', () => {
    let s = calibrate(initialCal(), 36, 0);
    s = calibrate(s, 36, 100);
    expect(s.step).toBe(1);
    expect(calibrate(s, 38, 500).captured.snare).toBe(38);
  });

  it('ignores the pedal note during the hi-hat closed step', () => {
    const s = feed(initialCal(), [36, 38, 46, 44]);
    const pressed = calibrate(s, 44, 10_000);
    expect(pressed.step).toBe(s.step);
    expect(calibrate(pressed, 42, 11_000).captured.hhClosed).toBe(42);
  });

  it('reports a clash (tom set to 49 like the crash) and does not advance', () => {
    let s = feed(initialCal(), [36, 38, 46, 44, 42, 49]); // tom1 on 49
    s = feed(s, [45, 43], 10_000);
    const clash = calibrate(s, 49, 20_000); // crash also 49
    expect(clash.conflict).toEqual({ note: 49, pad: 'tom1' });
    expect(clash.step).toBe(s.step);
  });

  it('skip and back', () => {
    let s = skip(calibrate(initialCal(), 36, 0));
    expect(s.step).toBe(2);
    s = back(back(s));
    expect(s).toMatchObject({ step: 0, captured: {} });
  });
});
