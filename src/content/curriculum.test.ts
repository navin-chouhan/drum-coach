import { describe, expect, it } from 'vitest';
import { ChartSchema } from '../engine/chart';
import { CURRICULUM, LESSON_BY_ID, MILESTONES, spreadFor } from './curriculum';
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
    'quarters-snare': 'count-quarters', '8ths-count': 'count-8ths', rests: 'rests', 'hh-8ths': 'hh-8ths', shuffle: 'shuffle', 'half-time': 'half-time',
    'triplet-fill': 'triplet-fill', 'jazz-ride': 'jazz-ride', comping: 'comping', 'feathered-kick': 'feathered-kick', 'kick-16-indep': 'kick-16-indep',
    'funk-96': 'funk-at-tempo', 'open-hat-funk': 'open-hat-funk', 'linear-groove': 'linear-groove', 'five-four': 'five-four', 'seven-eight': 'seven-eight',
    'fill-vocab': 'fill-vocab', 'fills-build': 'fills-build', 'linear-fill': 'linear-fill', 'first-beat': 'money-quarters', spotlight: 'song-spotlight',
  };
  it('levels match the curriculum', () => {
    for (const c of LIBRARY) {
      const l = LESSON_BY_ID[TAUGHT_IN[c.id]];
      expect(l, c.id).toBeDefined();
      expect(c.level, c.id).toBe(l.level);
    }
  });
  it('every level has 3+ charts, ids unique', () => {
    expect(new Set(LIBRARY.map(c => c.id)).size).toBe(LIBRARY.length);
    for (let level = 0; level <= 9; level++) expect(LIBRARY.filter(c => c.level === level).length, `level ${level}`).toBeGreaterThanOrEqual(3);
  });
});

describe('levels 7–9 (R3)', () => {
  it('every stage\'s checkpoints exist at its level, levels 7+ untagged, every checkpoint ends with a spread limit', () => {
    for (const m of MILESTONES) for (const id of m.checkpoints) {
      const l = LESSON_BY_ID[id];
      expect(l, id).toBeDefined();
      expect(l.level, id).toBe(m.level);
      if (m.level >= 7) expect(l.tags, id).toBeUndefined();
      expect(l.steps.at(-1)!.pass?.maxSpreadMs, id).toBe(spreadFor(m.level));
    }
    expect(MILESTONES.map(m => m.rank).slice(7)).toEqual(['Pocket Pro', 'Shape Shifter', 'Solo Voice']);
    expect(spreadFor(8)).toBe(20);
  });
  it('the odd-meter charts are valid', () => {
    expect(ChartSchema.safeParse(LESSON_BY_ID['five-four'].steps[0].chart).success).toBe(true);
    expect(ChartSchema.safeParse(LESSON_BY_ID['seven-eight'].steps[0].chart).success).toBe(true);
    expect(LESSON_BY_ID['seven-eight'].steps[0].chart.timeSignature).toEqual([7, 8]);
    expect(LESSON_BY_ID['song-odd'].steps[0].chart.bars).toBe(16);
  });
});
