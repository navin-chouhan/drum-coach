import { describe, expect, it } from 'vitest';
import { fitStage, MIN_AREA, PAIR_GAP, SHADOW } from './stageFit';

describe('fitStage: How it moves fits its drawing into the room left', () => {
  it('a wide, short area: the height limits it, the shape is kept', () => {
    expect(fitStage(905, 405, 1, 520 / 900)).toEqual({ w: 692, h: 400 }) // the area's height less the shadow;
  });
  it('a narrow, tall area: the width limits it', () => {
    const s = fitStage(405, 1000, 1, 0.5)!;
    expect(s).toEqual({ w: 400, h: 200 });
  });
  it('two drawings side by side share the width with the gap', () => {
    const s = fitStage(735, 2000, 2, 1)!;
    expect(s.w).toBe(Math.floor((735 - SHADOW - PAIR_GAP) / 2));
  });
  it('never 0 tall; null until measured', () => {
    expect(fitStage(800, 10, 1, 0.6)).toEqual({ w: Math.floor((MIN_AREA - SHADOW) / 0.6), h: MIN_AREA - SHADOW }); // the area's floor
    expect(fitStage(0, 500, 1, 0.6)).toBeNull();
    expect(fitStage(500, 0, 1, 0.6)).toBeNull();
  });
});
