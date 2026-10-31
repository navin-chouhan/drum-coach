// Ear training (web src/lesson/EarQuiz.tsx, G2): listen, then answer from the kit. "Steady or rushed?" plays the bar
// twice (A then B); "Where's the kick?" plays a groove. Answer with hi-hat × 1 (1), snare × 1 (2), floor × 1 (3), or
// keys 1–3; tom 2 × 1 (the R key is tom 2) plays it again. Four rounds, then done. The clips play through the take
// engine as demos (the controller's playClip), so they sound like every other "Hear it".
import type { Chart } from '@drum-coach/core/engine/chart';
import type { QuizKind } from '@drum-coach/core/engine/earQuiz';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigMove, Body, Button, Card, Display, color, getAppHitBus, useAppKey } from '../../ui';
import { daySeed, PAD_NAME, padAnswer, question, ROUNDS, roundClips, roundOf, summary, verdict } from './earQuiz';

type Play = (c: Chart, then?: () => void) => void;

export function EarQuiz({ kind, chart, play, onDone }: { kind: QuizKind; chart: Chart; play: Play; onDone: () => void }) {
  const [round, setRound] = useState(0), [right, setRight] = useState(0), [said, setSaid] = useState<{ ok: boolean; text: string }>();
  const [seed] = useState(() => daySeed(Date.now()));
  const q = roundOf(kind, round, seed);
  const live = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(() => { if (live.current) fn(); }, ms)); };
  useEffect(() => () => { live.current = false; timers.current.forEach(clearTimeout); }, []);

  const playRound = () => {
    const [a, b] = roundClips(kind, chart, q.answer);
    if (!b) { play(a); return; }
    play(a, () => later(() => play(b), 500));
  };
  const listen = () => { setSaid(undefined); playRound(); };
  const answer = (i: number) => {
    if (said || i >= q.options.length || round >= ROUNDS) return;
    const v = verdict(q, i);
    if (v.ok) setRight(r => r + 1);
    setSaid(v);
    later(() => { setSaid(undefined); setRound(r => r + 1); }, 1800);
  };
  const acts = useRef({ playRound, listen, answer });
  acts.current = { playRound, listen, answer };
  useEffect(() => { if (round < ROUNDS) acts.current.playRound(); }, [round]); // the verdict is already cleared when a round starts
  useEffect(() => getAppHitBus().onHit(h => {
    const a = padAnswer(h.pad);
    if (a === 'again') acts.current.listen(); else if (a !== null) acts.current.answer(a);
  }), []);
  useAppKey('1', () => answer(0));
  useAppKey('2', () => answer(1));
  useAppKey('3', () => answer(2));

  if (round >= ROUNDS) return (
    <Card tone="cream" style={styles.card} testID="lesson-quiz">
      <Display size={30} testID="lesson-quiz-summary">{summary(right)}</Display>
      <BigMove tone="go" label="✓ Done, next step" onPress={onDone} testID="lesson-quiz-done" style={styles.done} />
    </Card>
  );
  return (
    <Card tone="cream" style={styles.card} testID="lesson-quiz" accessibilityLabel={`Round ${round + 1} of ${ROUNDS}`}>
      <Body size={15} color={color.muted}>Round {round + 1} of {ROUNDS}</Body>
      <Display size={30}>{question(kind)}</Display>
      <View style={styles.options} accessibilityLiveRegion="polite">
        {q.options.map((o, i) => (
          <BigMove key={o} tone={said && i === q.answer ? 'go' : 'white'} label={`${i + 1}. ${o}`} note={`${PAD_NAME[i]} × 1 or key ${i + 1}`}
            onPress={() => answer(i)} testID={`lesson-quiz-answer-${i}`} style={styles.option} />
        ))}
      </View>
      {said
        ? <Display size={26} color={said.ok ? color.good : color.bad} testID="lesson-quiz-said">{said.text}</Display>
        : <Button emoji="🔁" label="Hear it again (tom 2 × 1 or R)" onPress={listen} testID="lesson-quiz-again" style={styles.again} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, alignSelf: 'stretch' },
  options: { gap: 12 },
  option: { minHeight: 64 },
  again: { alignSelf: 'flex-start' },
  done: { alignSelf: 'flex-start', minWidth: 320 },
});
