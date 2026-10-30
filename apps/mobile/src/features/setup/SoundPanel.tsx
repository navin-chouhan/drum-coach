// Sound levels (web SoundCheckCard): the click and music, the coach voice and the band, a click to play along with,
// a voice test, and the check from the throne (the app plays the click, the band, then the voice; you answer with a
// pad: hi-hat too quiet, snare OK, floor too loud). Sounds go through AudioPort.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { audio } from '../../platform/audio';
import { getStorage } from '../../platform/storage';
import { BigMove, Body, Button, Card, Display, Toggle, color, getAppHitBus, readSettings, useAppSettings, writeSettings } from '../../ui';
import { Group, GroupRow, Stepper } from './parts';
import {
  LEVEL_LABEL, LEVEL_STEP, SOUND_INTRO, THRONE_ANSWERS, THRONE_STEPS, THRONE_VOICE_LINE, VOICE_TEST, answerForPad, busLevels, clampLevel, levelOf,
  loopEvents, throneAnswer, throneAsk, throneTitle, type LevelKey,
} from './sound';
import type { Settings } from '@drum-coach/core/input/settings';

const kv = () => getStorage().kv;
function setLevels(patch: Partial<Settings>) {
  const s = writeSettings(kv(), patch);
  audio.setLevels(busLevels(s));
}

/** A looping click or band on AudioPort, topped up every 100 ms (2 s ahead). Returns stop. */
async function startLoop(kind: 'click' | 'band'): Promise<() => void> {
  const r = await audio.start();
  audio.setLevels(busLevels(readSettings(kv())));
  const zero = audio.clock.now() + Math.max(300, r.minLeadMs + 100);
  let next = 0;
  const top = () => { const p = loopEvents(kind, zero, next, audio.clock.now() + 2000); next = p.next; if (p.events.length) audio.schedule(p.events); };
  top();
  const t = setInterval(top, 100);
  return () => { clearInterval(t); audio.cancel(); };
}

async function say(text: string) {
  try {
    await audio.start();
    await audio.prepareWords([text]);
    audio.playNow(`word.${text}`, 1);
  } catch { /* no audio in this build */ }
}

export function SoundPanel() {
  const s = useAppSettings();
  const [clicking, setClicking] = useState(false);
  const [throne, setThrone] = useState(false);
  const [error, setError] = useState('');
  const stopLoop = useRef<() => void>(() => {});
  useEffect(() => () => stopLoop.current(), []);
  const stopClick = () => { stopLoop.current(); stopLoop.current = () => {}; setClicking(false); };
  const playClick = async () => {
    try { stopLoop.current = await startLoop('click'); setClicking(true); setError(''); } catch { setError('Sound is off in this build (it needs the Drum Coach app on the iPad).'); }
  };
  const level = (key: LevelKey) => (
    <GroupRow key={key} first={key === 'clickVolume'} title={LEVEL_LABEL[key]}
      right={<Stepper label={LEVEL_LABEL[key]} value={`${Math.round(levelOf(s, key) * 100)}%`} onStep={d => setLevels({ [key]: clampLevel(key, levelOf(s, key) + d * LEVEL_STEP) })} testID={`sound-${key}`} />} />
  );

  if (throne) return <ThroneCheck onDone={() => setThrone(false)} />;
  return (
    <View style={styles.wrap} testID="sound">
      <Body size={16}>{SOUND_INTRO}</Body>
      <Group title="Levels" style={styles.levels}>
        {level('clickVolume')}
        {level('voiceVolume')}
        {level('bandVolume')}
        <GroupRow title="Band under grooves" sub="bass and keys, offline" right={<Toggle label="Band under grooves" value={s.band !== false} onChange={band => writeSettings(kv(), { band })} testID="sound-band" />} />
      </Group>
      <View style={styles.row}>
        {clicking ? <Button label="Stop click" emoji="■" onPress={stopClick} testID="sound-click" />
          : <Button tone="blue" label="Play click" emoji="▶" onPress={() => void playClick()} testID="sound-click" />}
        <Button label="Test coach voice" emoji="🗣" onPress={() => void say(VOICE_TEST)} testID="sound-voice" />
        <Button tone="pop" label="Check from the kit" emoji="🥁" onPress={() => { stopClick(); setThrone(true); }} testID="sound-throne" />
      </View>
      {error ? <Body size={14} color={color.bad} weight="700">{error}</Body> : null}
    </View>
  );
}

/** The check from the throne (web ThroneCheck): one level at a time, answered from the kit. */
function ThroneCheck({ onDone }: { onDone: () => void }) {
  const s = useAppSettings();
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  const stopLoop = useRef<() => void>(() => {});
  const play = async (k: number) => {
    stopLoop.current(); stopLoop.current = () => {};
    const st = THRONE_STEPS[k];
    if (!st) return;
    if (st.key === 'voiceVolume') { void say(THRONE_VOICE_LINE); return; }
    try { stopLoop.current = await startLoop(st.key === 'clickVolume' ? 'click' : 'band'); } catch { /* no audio */ }
  };
  const answer = (a: number) => {
    const r = throneAnswer(stepRef.current, a, readSettings(kv()));
    if (r.patch) setLevels(r.patch);
    if (r.finished) { stopLoop.current(); onDone(); return; }
    if (r.step !== stepRef.current) { stepRef.current = r.step; setStep(r.step); void play(r.step); } else if (r.replay) void play(r.step);
  };
  const answerRef = useRef(answer);
  answerRef.current = answer;
  useEffect(() => {
    void play(0);
    const off = getAppHitBus().onHit(h => { const a = answerForPad(h.pad); if (a !== null) answerRef.current(a); });
    return () => { off(); stopLoop.current(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once; answers read the step through the ref
  const st = THRONE_STEPS[step];
  if (!st) return null;
  return (
    <View style={styles.wrap} testID="throne" accessibilityLiveRegion="polite">
      <Card style={styles.throne}>
        <Display size={18} color={color.muted}>{throneTitle(step)}</Display>
        <Display size={44}>{st.name}</Display>
        <Body size={20}>{throneAsk(step, s)}</Body>
      </Card>
      <View style={styles.row}>
        {THRONE_ANSWERS.map(([label, g], a) => (
          <BigMove key={label} tone={a === 1 ? 'go' : 'alt'} label={label} note={`${g} or key ${a + 1}`} onPress={() => answer(a)} testID={`throne-answer-${a}`} style={styles.move} />
        ))}
      </View>
      <Button tone="plain" label="Stop" onPress={() => { stopLoop.current(); onDone(); }} testID="throne-stop" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 16 },
  levels: { maxWidth: 640 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'center', flexWrap: 'wrap' },
  throne: { gap: 10, maxWidth: 820 },
  move: { minWidth: 220, minHeight: 80 },
});
