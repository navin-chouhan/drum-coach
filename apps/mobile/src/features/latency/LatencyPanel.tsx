// The latency tap test (mockup first-run-4-latency; web LatencyCard): the coach counts in "1, 2, 3, 4", then you hit
// the snare with 16 clicks. Clicks are scheduled through AudioPort as heard times, so the offset is hit − heard click.
// Saved for the current audio route (D6). Used by Setup → Latency and the first run's step 4.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { audio } from '../../platform/audio';
import { speakAt } from '../../play/spokenFallback';
import { sayNow } from '../coach/voice';
import { useAudioEngine, useAudioInterruptions } from '../../platform/useAudio';
import { getStorage } from '../../platform/storage';
import { BigMove, Body, Button, Card, Display, Pill, StatTile, color, drumColor, font, getAppHitBus, hardShadow, stroke, useAppSettings, writeSettings } from '../../ui';
import { busLevels } from '../setup/sound';
import { clearRouteLatency, routeLabel, saveRouteLatency } from './latencyByRoute';
import {
  CLICKS, COUNT_IN, COUNT_WORDS, TAP_INTRO, countInWords, addTap, outputNote, planTapTest, startTapTest, tapEstimate, tapReadout, tapTestOver, trustworthy,
  verdictText, type Estimate, type TapTest,
} from './tapTest';
import type { AudioRoute } from '@drum-coach/core/play/audioPort';

/** A call, the app leaving or the engine stopping mid-test: its clicks are gone, so the taps measure nothing. */
export const TEST_STOPPED = 'The test stopped (a call, the app in the background or the sound restarting). Press Start again.';

type Phase = { kind: 'idle' } | { kind: 'starting' } | { kind: 'running' } | { kind: 'done'; estimate: Estimate | null } | { kind: 'error'; text: string };

export function LatencyPanel({ onSaved, firstRun = false, testID = 'latency' }: { onSaved?: () => void; firstRun?: boolean; testID?: string }) {
  const settings = useAppSettings();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [route, setRoute] = useState<AudioRoute | null>(() => audio.route());
  const [test, setTest] = useState<TapTest | null>(null);
  const [, setNow] = useState(0);
  const stop = useRef<() => void>(() => {});
  useEffect(() => audio.onRouteChange(r => { setRoute(r); stop.current(); setPhase(p => (p.kind === 'running' ? { kind: 'idle' } : p)); }), []);
  useEffect(() => () => stop.current(), []);
  useAudioEngine(); // the clicks can start at once
  useAudioInterruptions(phase.kind === 'running', () => { stop.current(); setPhase({ kind: 'error', text: TEST_STOPPED }); });

  async function start() {
    stop.current();
    setPhase({ kind: 'starting' });
    let r: AudioRoute, missing: string[];
    try {
      r = await audio.start();
      missing = (await audio.prepareWords(COUNT_WORDS)).missing;
    } catch {
      setPhase({ kind: 'error', text: 'Sound is off in this build: the tap test needs the Drum Coach app on the iPad (not Expo Go or the simulator).' });
      return;
    }
    setRoute(r);
    audio.setLevels(busLevels(settings));
    const plan = planTapTest(audio.clock.now(), r);
    audio.schedule(plan.events);
    // "1, 2, 3, 4" said live when the engine couldn't render the words (play/spokenFallback.ts)
    const unsay = speakAt(countInWords(plan, missing), audio.clock.now(), w => sayNow(w), { setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: h => clearTimeout(h as ReturnType<typeof setTimeout>) });
    let t = startTapTest(plan);
    setTest(t);
    setPhase({ kind: 'running' });
    const off = getAppHitBus().onHit(h => { t = addTap(t, h.time); setTest(t); });
    const timer = setInterval(() => {
      setNow(audio.clock.now());
      if (tapTestOver(t, audio.clock.now())) { cleanup(); setPhase({ kind: 'done', estimate: tapEstimate(t) }); }
    }, 100);
    function cleanup() { off(); clearInterval(timer); unsay(); stop.current = () => {}; }
    stop.current = () => { cleanup(); audio.cancel(); };
  }

  const save = (e: Estimate) => {
    const kv = getStorage().kv;
    const r = route ?? { key: 'Speaker', name: 'Speaker', kind: 'speaker' as const };
    writeSettings(kv, saveRouteLatency(kv, r, e.latencyMs));
    onSaved?.();
  };

  const running = phase.kind === 'running';
  const readout = test ? tapReadout(test) : null;
  const sinceStart = test ? audio.clock.now() - test.plan.zero : -1;
  const beat = running && sinceStart >= 0 ? Math.floor(sinceStart / 1000) : -1;
  const counting = beat >= 0 && beat < COUNT_IN;
  const onSnare = counting ? String(beat + 1) : running ? `${Math.min(CLICKS, Math.max(1, beat - COUNT_IN + 1))}` : '';
  const verdict = phase.kind === 'done' ? verdictText(phase.estimate) : null;
  const canSave = phase.kind === 'done' && trustworthy(phase.estimate);
  const note = phase.kind === 'done' ? outputNote(route, !!settings.browserSounds) : null; // the web: turn the app's drum sounds off

  return (
    <View style={styles.wrap} testID={testID} accessibilityLiveRegion="polite">
      <Card elevation={10} style={styles.card}>
        <Display size={firstRun ? 44 : 34} style={styles.center} accessibilityRole="header">Hit the snare with the click</Display>
        <Body size={18} style={styles.center}>{firstRun ? '16 hits. The app learns how late your speakers are and corrects every score.' : TAP_INTRO}</Body>
        <Pill tone="blue" emoji="🔊" style={styles.pill}>Listening through: {routeLabel(route)}</Pill>
        <View style={styles.snare} accessible accessibilityLabel={counting ? `Count in ${onSnare}` : running ? `Click ${onSnare}` : 'The snare'}>
          <Text style={styles.snareNum}>{onSnare}</Text>
        </View>
        <View style={styles.taps} accessible accessibilityLabel={`${readout?.hits ?? `0 of ${CLICKS}`} hits`}>
          {Array.from({ length: CLICKS }, (_, i) => <View key={i} style={[styles.tap, i < (test?.taps.length ?? 0) && styles.tapOn]} />)}
        </View>
        <View style={styles.readout}>
          <StatTile value={readout?.hits.split(' ')[0] ?? '0'} unit={` of ${CLICKS}`} label="hits so far" testID={`${testID}-hits`} />
          <StatTile value={readout?.average ?? '–'} label={`${readout?.when ?? 'after'} the click, on average`} testID={`${testID}-average`} />
          <StatTile value={readout?.steady ?? '–'} label={readout?.steadyOk ? 'steady: a good measurement' : 'how steady'} testID={`${testID}-steady`} />
        </View>
        {verdict ? <Body size={16} weight="700" color={verdict.warn ? color.bad : color.ink} style={styles.center} testID={`${testID}-verdict`}>{verdict.text}</Body> : null}
        {note ? <Body size={14} style={styles.center}>{note}</Body> : null}
        {note && settings.browserSounds ? <Button size="small" label="Turn off the app's drum sounds" onPress={() => writeSettings(getStorage().kv, { browserSounds: false })} testID={`${testID}-sounds-off`} /> : null}
        {phase.kind === 'error' ? <Body size={16} weight="700" color={color.bad} style={styles.center}>{phase.text}</Body> : null}
        {!running && phase.kind !== 'done' ? <Body size={14} color={color.muted} style={styles.center}>{firstRun ? "I'm measuring how late the sound reaches you, not how well you play. Then on time is on time." : `Current correction: ${settings.latencyMs} ms.`}</Body> : null}
      </Card>
      <View style={styles.foot}>
        <BigMove tone={phase.kind === 'idle' || phase.kind === 'error' ? 'go' : 'alt'} emoji={phase.kind === 'idle' ? '▶' : '↻'}
          label={phase.kind === 'idle' ? 'Start' : 'Start again'} disabled={phase.kind === 'starting'} onPress={() => void start()} testID={`${testID}-start`} style={styles.move} />
        <View style={styles.sp} />
        {!firstRun && settings.latencyMs !== 0 && phase.kind !== 'running'
          ? <Button label="Reset to 0" onPress={() => writeSettings(getStorage().kv, clearRouteLatency(getStorage().kv, route?.key ?? 'Speaker'))} testID={`${testID}-reset`} />
          : null}
        <BigMove tone="go" emoji="✓" label={phase.kind === 'done' && phase.estimate && canSave ? `${firstRun ? 'Done' : 'Save'} · ${phase.estimate.latencyMs} ms` : firstRun ? 'Done' : 'Save'}
          disabled={!canSave} onPress={() => { if (phase.kind === 'done' && phase.estimate) save(phase.estimate); }} testID={`${testID}-save`} style={styles.move} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 18, alignItems: 'center' },
  card: { width: 800, maxWidth: '100%', alignItems: 'center', gap: 8, paddingVertical: 20, paddingHorizontal: 30, borderWidth: 4 },
  center: { textAlign: 'center' },
  pill: { alignSelf: 'center' },
  snare: { width: 150, height: 150, borderRadius: 75, backgroundColor: drumColor.snare, borderWidth: 4, borderColor: color.ink, boxShadow: hardShadow(5), alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  snareNum: { ...font.display, fontSize: 64, color: color.ink },
  taps: { flexDirection: 'row', gap: 9 },
  tap: { width: 24, height: 24, borderRadius: 12, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel },
  tapOn: { backgroundColor: drumColor.snare },
  readout: { flexDirection: 'row', gap: 14, alignSelf: 'stretch', marginTop: 8 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 14, alignSelf: 'stretch' },
  sp: { flex: 1 },
  move: { minHeight: 60, minWidth: 200 },
});
