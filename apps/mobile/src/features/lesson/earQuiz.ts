// The ear quiz's model (web src/lesson/EarQuiz.tsx, G2): four rounds of "Steady or rushed?" or "Where's the kick?",
// answered from the kit (hi-hat 1, snare 2, floor 3; tom 2 hears it again) or keys 1–3. The rounds and charts are
// core's (engine/earQuiz.ts). Pure: EarQuiz.tsx draws it and plays the clips.
import type { Chart } from '@drum-coach/core/engine/chart';
import { kickChart, quizRound, rushedChart, type QuizKind } from '@drum-coach/core/engine/earQuiz';
import type { PadId } from '@drum-coach/core/engine/kit';

export const ROUNDS = 4;
export const PAD_NAME = ['hi-hat', 'snare', 'floor tom'] as const;
const ANSWER_PADS: readonly PadId[] = ['hhClosed', 'snare', 'floor'];

/** A new set each day (the web's seed). */
export const daySeed = (nowMs: number) => Math.floor(nowMs / 86_400_000) * 10;

export const roundOf = (kind: QuizKind, round: number, seed: number) => quizRound(kind, round + seed);

/** What a pad does in the quiz: an answer (0–2), "again" (tom 2), or nothing. */
export function padAnswer(pad: PadId | undefined): number | 'again' | null {
  if (pad === 'tom2') return 'again';
  const i = ANSWER_PADS.indexOf(pad === 'hhOpen' ? 'hhClosed' : (pad as PadId));
  return i >= 0 ? i : null;
}

/** The clips of a round: the groove (kick), or A then B (steady), one of them rushing. */
export function roundClips(kind: QuizKind, chart: Chart, answer: number): Chart[] {
  if (kind === 'kick') return [kickChart(answer)];
  return answer === 0 ? [chart, rushedChart(chart)] : [rushedChart(chart), chart];
}

export const question = (kind: QuizKind) => (kind === 'steady' ? 'Listen to A, then B. Which one was steady?' : 'Listen. Where is the kick?');

/** The verdict on an answer. */
export function verdict(q: { options: string[]; answer: number }, i: number): { ok: boolean; text: string } {
  const ok = i === q.answer;
  return { ok, text: ok ? '✓ Right!' : `Not quite: ${q.options[q.answer].replace(' was steady', '')} was the one.` };
}

/** After the last round. */
export const summary = (right: number) =>
  `${right} of ${ROUNDS} right${right === ROUNDS ? '. Great ears!' : right >= ROUNDS / 2 ? '. Nice listening.' : '. Your ears get sharper every time.'}`;
