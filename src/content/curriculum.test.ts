import { describe, expect, it } from 'vitest';
import { ChartSchema } from '../engine/chart';
import { CURRICULUM, LESSON_BY_ID } from './curriculum';
import { LIBRARY } from './library';

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

describe('Practice library', () => {
  // Each built-in Practice chart sits at the level where the path teaches its skill.
  const TAUGHT_IN: Record<string, string> = {
    'rock-8ths': 'money-8ths', 'rock-kick-var': 'kick-and3', 'ride-pedal': 'ride-groove', disco: 'four-floor',
    'funk-ghosts': 'ghost-notes', 'shuffle-68': 'six-eight', singles: 'singles', 'accent-8ths': 'accents',
    paradiddle: 'paradiddle', 'singles-toms': 'singles-toms', 'fill-toms': 'fill-8ths', 'fill-snare16': 'fill-16-snare',
  };
  it('levels match the curriculum', () => {
    for (const c of LIBRARY) {
      const l = LESSON_BY_ID[TAUGHT_IN[c.id]];
      expect(l, c.id).toBeDefined();
      expect(c.level, c.id).toBe(l.level);
    }
  });
});
