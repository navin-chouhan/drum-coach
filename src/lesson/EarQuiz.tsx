import { useEffect, useEffectEvent, useState } from 'react';
import { onCoachAction } from '../coach/session';
import type { Chart } from '../engine/chart';
import { kickChart, quizRound, rushedChart, type QuizKind } from '../engine/earQuiz';
import { onHit } from '../input/hits';

const ROUNDS = 4, ANSWER_PADS = ['hhClosed', 'snare', 'floor'] as const, PAD_NAME = ['hi-hat', 'snare', 'floor tom'];

/**
 * Ear training (G2): listen, then answer from the kit. "Steady or rushed?" plays the bar twice (A then B); "Where's
 * the kick?" plays a groove. Answer with hi-hat × 1 (1), snare × 1 (2), floor × 1 (3), or keys 1–3; tom 2 × 1 or R
 * plays it again. Four rounds, then done.
 */
export function EarQuiz({ kind, chart, play, onDone }: { kind: QuizKind; chart: Chart; play: (c: Chart, then?: () => void) => void; onDone: () => void }) {
  const [round, setRound] = useState(0), [right, setRight] = useState(0), [said, setSaid] = useState<{ ok: boolean; text: string }>();
  const [seed] = useState(() => Math.floor(Date.now() / 86_400_000) * 10); // a new set each day
  const q = quizRound(kind, round + seed);
  const playRound = () => {
    if (kind === 'kick') { play(kickChart(q.answer)); return; }
    const [a, b] = q.answer === 0 ? [chart, rushedChart(chart)] : [rushedChart(chart), chart];
    play(a, () => setTimeout(() => play(b), 500));
  };
  const listen = () => { setSaid(undefined); playRound(); };
  const answer = (i: number) => {
    if (said || i >= q.options.length) return;
    const ok = i === q.answer;
    if (ok) setRight(r => r + 1);
    setSaid({ ok, text: ok ? '✓ Right!' : `Not quite: ${q.options[q.answer].replace(' was steady', '')} was the one.` });
    setTimeout(() => { setSaid(undefined); setRound(r => r + 1); }, 1800);
  };
  const onRound = useEffectEvent(playRound), onListen = useEffectEvent(listen), onAnswer = useEffectEvent(answer);
  useEffect(() => { if (round < ROUNDS) onRound(); }, [round]); // the verdict is already cleared when a round starts
  useEffect(() => {
    const offHit = onHit(h => {
      const i = ANSWER_PADS.indexOf(h.pad === 'hhOpen' ? 'hhClosed' : (h.pad as (typeof ANSWER_PADS)[number]));
      if (i >= 0) onAnswer(i); else if (h.pad === 'tom2') onListen();
    });
    const offCmd = onCoachAction(() => true); // the kit's taps answer the quiz
    const onKey = (e: KeyboardEvent) => { if (/^[123]$/.test(e.key)) onAnswer(Number(e.key) - 1); if (e.key === 'r') onListen(); };
    window.addEventListener('keydown', onKey);
    return () => { offHit(); offCmd(); window.removeEventListener('keydown', onKey); };
  }, []);

  if (round >= ROUNDS) return (
    <div className="card earQuiz">
      <p className="quizQ">{right} of {ROUNDS} right{right === ROUNDS ? '. Great ears!' : right >= ROUNDS / 2 ? '. Nice listening.' : '. Your ears get sharper every time.'}</p>
      <button className="primary big" onClick={onDone}>✓ Done, next step</button>
    </div>
  );
  return (
    <div className="card earQuiz" aria-live="polite">
      <p className="small">Round {round + 1} of {ROUNDS}</p>
      <p className="quizQ">{kind === 'steady' ? 'Listen to A, then B. Which one was steady?' : 'Listen. Where is the kick?'}</p>
      <div className="quizOptions">
        {q.options.map((o, i) => <button key={o} className={`move ${said && i === q.answer ? 'go' : ''}`} onClick={() => answer(i)}>
          <b>{i + 1}. {o}</b><span className="g"><i>{PAD_NAME[i]} × 1</i> or key {i + 1}</span></button>)}
      </div>
      {said ? <p className={`quizSaid ${said.ok ? 'ok' : ''}`}>{said.text}</p> : <button onClick={listen}>🔁 Hear it again <small>(tom 2 × 1 or R)</small></button>}
    </div>
  );
}
