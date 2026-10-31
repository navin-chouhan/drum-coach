import { describe, expect, it } from 'vitest';
import { SHEET_H_AT_1_6, sheetScaleFor } from './sheetFit';

describe('the sheet zoom for its paper', () => {
  it('is 1.6 when the paper is tall enough, less on a shorter one, never under 1.1', () => {
    expect(sheetScaleFor(SHEET_H_AT_1_6)).toBe(1.6);
    expect(sheetScaleFor(600)).toBe(1.6);
    expect(sheetScaleFor(255)).toBe(1.36);
    expect(sheetScaleFor(100)).toBe(1.1);
  });
  it('waits for a measured paper', () => {
    expect(sheetScaleFor(0)).toBeUndefined();
    expect(sheetScaleFor(Number.NaN)).toBeUndefined();
  });
});
