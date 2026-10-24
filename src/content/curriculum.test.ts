import { describe, expect, it } from 'vitest';
import { ChartSchema } from '../engine/chart';
import { CURRICULUM } from './curriculum';

describe('curriculum', () => {
  it('has unique ids and valid charts', () => {
    expect(new Set(CURRICULUM.map(l => l.id)).size).toBe(CURRICULUM.length);
    for (const l of CURRICULUM) for (const s of l.steps) {
      const r = ChartSchema.safeParse(s.chart);
      expect(r.success, `${s.chart.id}: ${r.error?.message}`).toBe(true);
      expect(s.chart.id!.length).toBeLessThanOrEqual(80);
      expect(s.bpm.start).toBeLessThanOrEqual(s.bpm.target);
    }
  });
  it('every active lane has notes, and the student always has something to play', () => {
    for (const l of CURRICULUM) for (const s of l.steps) {
      const lanes = new Set(s.chart.notes.map(n => n.drum));
      for (const a of s.activeLanes ?? []) expect(lanes.has(a), `${s.chart.id} lane ${a}`).toBe(true);
    }
  });
  it('levels never go backwards along the path', () => {
    CURRICULUM.forEach((l, i) => i && expect(l.level).toBeGreaterThanOrEqual(CURRICULUM[i - 1].level));
  });
  it('triplet patterns land on thirds of a beat', () => {
    const t = CURRICULUM.find(l => l.id === 'triplets')!.steps[0].chart.notes.map(n => n.t);
    expect(t.slice(0, 4)).toEqual([0, 1 / 3, 2 / 3, 1]);
  });
});
