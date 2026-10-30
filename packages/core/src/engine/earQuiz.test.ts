import { describe, expect, it } from 'vitest';
import { pattern } from './chart';
import { KICK_CHOICES, kickChart, quizRound, rushedChart } from './earQuiz';

const chart = { title: 't', bpm: 70, timeSignature: [4, 4] as [number, 4], bars: 1, notes: pattern({ snare: 'xxxx' }, 1) };

describe('ear quiz (G2)', () => {
  it('a rushed version pulls each note a little earlier than the last', () => {
    const r = rushedChart(chart);
    const shift = r.notes.map((n, i) => chart.notes[i].t - n.t);
    expect(shift[0]).toBe(0);
    for (let i = 1; i < shift.length; i++) expect(shift[i]).toBeGreaterThan(shift[i - 1]);
    expect(r.notes.every(n => n.t >= 0)).toBe(true);
  });
  it('each round shuffles where the right answer is, the same for the same seed', () => {
    const answers = Array.from({ length: 12 }, (_, i) => quizRound('steady', i).answer);
    expect(new Set(answers).size).toBe(2);
    expect(quizRound('steady', 3)).toEqual(quizRound('steady', 3));
    expect(quizRound('kick', 5).options).toHaveLength(KICK_CHOICES.length);
  });
  it('the kick choices are a money beat with different kick lines', () => {
    const c = kickChart(1);
    expect(c.notes.filter(n => n.drum === 'hihat')).toHaveLength(8);
    expect(c.notes.filter(n => n.drum === 'kick').map(n => n.t)).toEqual([0, 2.5]);
  });
});
