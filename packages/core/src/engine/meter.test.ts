import { describe, expect, it } from 'vitest';
import { countPlan } from './lesson';
import { groupStarts, groupsOf, isOdd8 } from './meter';

describe('odd meters (R3)', () => {
  it('groups of 8ths', () => {
    expect(groupsOf([5, 8])).toEqual([3, 2]);
    expect(groupsOf([7, 8])).toEqual([2, 2, 3]);
    expect(groupsOf([6, 8])).toEqual([3, 3]);
    expect([...groupStarts([7, 8])]).toEqual([0, 2, 4]);
    expect(isOdd8([7, 8])).toBe(true); expect(isOdd8([6, 8])).toBe(false); expect(isOdd8([5, 4])).toBe(false);
  });
  it('7/8 is counted in 8ths: one to seven', () => {
    expect(countPlan(2, 3.5, '8ths', [7, 8])[0]).toEqual(['one', 'two', 'three', 'four', 'five', 'six', 'seven']);
    expect(countPlan(1, 5, 'quarters')[0]).toEqual(['one', 'two', 'three', 'four', 'five']); // 5/4 as before
  });
});
