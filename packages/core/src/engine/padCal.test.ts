import { describe, expect, it } from 'vitest';
import { mapVelocity, measurePad, mirrorHands } from './padCal';

describe('per-pad velocity (N9)', () => {
  it('maps each pad\'s own soft and loud to the same scale (soft 30, loud 120); no calibration = unchanged', () => {
    const cal = { soft: 15, loud: 105 };
    expect(mapVelocity(15, cal)).toBe(30);
    expect(mapVelocity(105, cal)).toBe(120);
    expect(mapVelocity(60, cal)).toBe(75);
    expect(mapVelocity(127, cal)).toBe(127); // clamped
    expect(mapVelocity(64)).toBe(64);
  });
  it('a soft-reading pad and a hot pad give the same number for the same stroke height', () => {
    expect(mapVelocity(40, { soft: 10, loud: 70 })).toBe(mapVelocity(70, { soft: 40, loud: 100 }));
  });
});

describe('measurePad (N9)', () => {
  it('soft and loud are the medians; retriggers after loud strokes set the pad\'s bounce window', () => {
    const softs = [18, 20, 16, 19];
    const louds = [{ time: 0, velocity: 118 }, { time: 38, velocity: 55 }, { time: 600, velocity: 122 }, { time: 1200, velocity: 120 }, { time: 1247, velocity: 63 }, { time: 1800, velocity: 116 }];
    const m = measurePad(softs, louds);
    expect(m).toMatchObject({ soft: 18.5, loud: 119 });
    expect(m.bounceMs).toBe(57); // the latest retrigger (47 ms) + 10
    expect(m.bounceRatio).toBeCloseTo(0.63, 2); // 63/120 + 0.1
  });
  it('a pad that never retriggers keeps the default filter', () => {
    const m = measurePad([20, 20], [{ time: 0, velocity: 110 }, { time: 600, velocity: 112 }]);
    expect(m.bounceMs).toBeUndefined();
    expect(m.bounceRatio).toBeUndefined();
  });
});

describe('mirrorHands (N9, left-handed)', () => {
  it('swaps right and left, grace hands too; feet stay', () => {
    expect(mirrorHands('R+K')).toBe('L+K');
    expect(mirrorHands('lR')).toBe('rL');
    expect(mirrorHands('R L R R')).toBe('L R L L');
    expect(mirrorHands('H')).toBe('H');
  });
});
