import { pattern, type Chart } from './chart.ts';
import { seededRandom } from './kitEmulator.ts';

// Ear training (G2): short listening quizzes answered from the kit. Pure: the charts to play and the right answer.

/** The same bar, rushing: each note lands a little earlier than the one before (up to ~1/8 of a beat by the end). */
export function rushedChart(c: Chart): Chart {
  const n = c.notes.length;
  return { ...c, title: `${c.title} (rushed)`, notes: c.notes.map((x, i) => ({ ...x, t: Math.max(0, x.t - (0.12 * i) / Math.max(1, n - 1)) })) };
}

export const KICK_CHOICES = ['Kick on 1 and 3', 'Kick on 1 and the & of 3', 'Kick on 1, the & of 2, and 3'] as const;
const KICKS = ['x...x...', 'x....x..', 'x..xx...'];
/** The money beat with kick line `i` of KICK_CHOICES. */
export const kickChart = (i: number): Chart => ({ title: "Where's the kick?", bpm: 80, timeSignature: [4, 4], bars: 1,
  notes: pattern({ hihat: 'xxxxxxxx', snare: '..x...x.', kick: KICKS[i] }, 2) });

export type QuizKind = 'steady' | 'kick';
/**
 * One round: what the options are and which one is right. "steady": two takes of the bar (A, B), one of them rushing.
 * "kick": one groove, which kick line is it? Seeded per round so a round replays the same way.
 */
export function quizRound(kind: QuizKind, round: number): { options: string[]; answer: number } {
  const r = seededRandom(round * 977 + (kind === 'kick' ? 13 : 1))();
  return kind === 'steady' ? { options: ['A was steady', 'B was steady'], answer: r < 0.5 ? 0 : 1 }
    : { options: [...KICK_CHOICES], answer: Math.floor(r * KICK_CHOICES.length) };
}
