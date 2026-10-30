import { describe, expect, it } from 'vitest';
import { gestureLabel, gesturesFor, gestureSpoken } from './gestures';
import { DASH, DASH_GAP, ratio, ringAngles, trailGeometry } from './layout';
import { drumColor, padColor } from './tokens';

describe('ringAngles', () => {
  it('fills the right half first, then the left', () => {
    expect(ringAngles(0)).toEqual({ right: 0, left: 0 });
    expect(ringAngles(0.25)).toEqual({ right: 90, left: 0 });
    expect(ringAngles(0.5)).toEqual({ right: 180, left: 0 });
    expect(ringAngles(0.75)).toEqual({ right: 180, left: 90 });
    expect(ringAngles(1)).toEqual({ right: 180, left: 180 });
  });
  it('clamps nonsense', () => {
    expect(ringAngles(-1)).toEqual({ right: 0, left: 0 });
    expect(ringAngles(3)).toEqual({ right: 180, left: 180 });
    expect(ringAngles(Number.NaN)).toEqual({ right: 0, left: 0 });
  });
  it('ratio guards an empty max', () => {
    expect(ratio(5, 16)).toBeCloseTo(0.3125);
    expect(ratio(3, 0)).toBe(0);
    expect(ratio(20, 16)).toBe(1);
  });
});

describe('trailGeometry', () => {
  it('matches the mockup: 9 stops, the line from 5.5% to 94.5%, solid to the 4th stop (33%)', () => {
    const w = 900, g = trailGeometry(w, 9, 3);
    expect(g.centers).toHaveLength(9);
    expect(g.centers[0] / w).toBeCloseTo(0.0556, 3);
    expect(g.centers[8] / w).toBeCloseTo(0.9444, 3);
    expect(g.done.x).toBeCloseTo(50);
    expect(g.done.width / w).toBeCloseTo(3 / 9);
    expect(g.dashes[0].x).toBeCloseTo(g.centers[3]);
  });
  it('dashes are 7 on, 6 off and never pass the last stop', () => {
    const g = trailGeometry(900, 9, 3), last = g.centers[8];
    for (let i = 1; i < g.dashes.length; i++) expect(g.dashes[i].x - g.dashes[i - 1].x).toBeCloseTo(DASH + DASH_GAP);
    for (const d of g.dashes) { expect(d.width).toBeLessThanOrEqual(DASH); expect(d.x + d.width).toBeLessThanOrEqual(last + 1e-9); }
  });
  it('day one: nothing reached, all dashed', () => {
    const g = trailGeometry(600, 6, -1);
    expect(g.done.width).toBe(0);
    expect(g.dashes[0].x).toBeCloseTo(g.centers[0]);
  });
  it('all reached: all solid, no dashes', () => {
    const g = trailGeometry(600, 6, 5);
    expect(g.done.width).toBeCloseTo(g.centers[5] - g.centers[0]);
    expect(g.dashes).toEqual([]);
  });
  it('handles empty and tiny trails', () => {
    expect(trailGeometry(600, 0, 0).centers).toEqual([]);
    expect(trailGeometry(0, 3, 0).centers).toEqual([]);
    const one = trailGeometry(100, 1, 0);
    expect(one.centers).toEqual([50]);
    expect(one.dashes).toEqual([]);
    expect(trailGeometry(600, 4, 99).done.width).toBeCloseTo(450); // reached past the end = the last stop
  });
});

describe('gestures', () => {
  it('names the core rules as the mockups show them', () => {
    expect(gesturesFor('yes').map(gestureLabel)).toEqual(['hi-hat pedal × 3', 'crash × 2']);
    expect(gesturesFor('next').map(gestureLabel)).toEqual(['ride × 2']);
    expect(gesturesFor('listen').map(gestureLabel)).toEqual(['tom 2 × 2']);
    expect(gesturesFor('slower').map(gestureLabel)).toEqual(['floor × 2']);
    expect(gesturesFor('faster').map(gestureLabel)).toEqual(['tom 1 × 2']);
    expect(gesturesFor('stop').map(gestureLabel)).toEqual(['crash × 4']);
  });
  it('speaks them for VoiceOver', () => {
    expect(gestureSpoken({ pad: 'hhPedal', times: 3 })).toBe('Hi-hat pedal three times');
    expect(gestureSpoken({ pad: 'tom2', times: 2 })).toBe('Tom 2 twice');
  });
  it('a pad dot takes its drum colour; the hi-hat pads share yellow', () => {
    expect(padColor('hhPedal')).toBe(drumColor.hihat);
    expect(padColor('crash')).toBe('#FF5FA2');
    expect(new Set(Object.values(drumColor)).size).toBe(8); // one colour per drum
  });
});
