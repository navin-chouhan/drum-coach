// Practice's metronome-only mode: just the click, no take and no score. − / + tempo (tom 1 / floor × 2 from the kit),
// clicks per bar, quarters / 8ths / 16ths, tap tempo, and Start (hi-hat pedal × 3). While the click runs you're
// playing, so only crash × 4 counts from the kit (it stops), as during a take (QA2 M3): a tom fill never changes the
// tempo. A call, the app leaving the foreground or a new audio output stops the click (QA2 m1). The clicks are planned
// on the AudioPort's clock ahead of time by the take engine's planner (core createMetronome: ≥ 2 s handed over).
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createMetronome, type Metronome } from '@drum-coach/core/play/metronome';
import { audio } from '../../platform/audio';
import { useAudioEngine, useAudioInterruptions } from '../../platform/useAudio';
import { getStorage } from '../../platform/storage';
import {
  BigMove, Body, Button, Card, CardTitle, Display, MAX_FONT_SCALE, Screen, Segmented,
  color, gesturesFor, stroke, tabular, useAppSettings, useKitMoves,
  Notice, RoundButton,
} from '../../ui';
import { clickInBar, clicksPerBar, METERS, meterLabel, nudgeBpm, readMetronome, SUBDIVISIONS, tapTempo, writeMetronome, type MetronomeSettings } from './metronome';

/** What the screen says when an interruption stopped the click. */
export const STOPPED_NOTE = 'The click stopped (a call, the app in the background or a new audio output). Press Start when you are ready.';

export function MetronomeScreen() {
  useAudioEngine(); // ready to click at once, and again after the app comes back (QA2 M2)
  const kv = getStorage().kv;
  const settings = useAppSettings();
  const [s, setS] = useState<MetronomeSettings>(() => readMetronome(kv));
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [error, setError] = useState('');
  const metro = useRef<Metronome | null>(null);
  const taps = useRef<number[]>([]);

  const stop = () => { metro.current?.stop(); metro.current = null; setRunning(false); setBeat(-1); };
  const start = async (spec: MetronomeSettings = s) => {
    stop();
    if (!audio.available) { setError('The click needs the iPad build with its audio engine (not available here).'); return; }
    try {
      await audio.start();
      audio.setLevels({ click: settings.clickVolume });
      const m = createMetronome({ clock: audio.clock, audio }, { bpm: spec.bpm, timeSignature: spec.timeSignature, subdivision: spec.subdivision });
      await m.start();
      metro.current = m;
      setRunning(true); setError('');
    } catch (e) { setError(`The click could not start: ${e instanceof Error ? e.message : 'audio error'}`); }
  };
  const change = (patch: Partial<MetronomeSettings>) => {
    const next = { ...s, ...patch };
    setS(next); writeMetronome(kv, next);
    if (running) void start(next); // a new tempo restarts the click on the next beat
  };
  const toggle = () => (running ? stop() : void start());
  const tap = () => {
    const t = audio.clock.now();
    taps.current = [...taps.current.slice(-7), t];
    const bpm = tapTempo(taps.current);
    if (bpm) change({ bpm });
  };

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const m = metro.current;
      if (!m) return;
      const n = audio.clock.now();
      m.tick(n);
      setBeat(clickInBar(s.timeSignature, m.position(n)));
    }, 50);
    return () => clearInterval(t);
  }, [running, s]);
  useEffect(() => () => { metro.current?.stop(); }, []);
  const clicks = clicksPerBar(s.timeSignature);
  // Playing along: only crash × 4 (stop) counts, as in a take; stopped, the pedal starts it and the toms set the tempo.
  useKitMoves({ yes: toggle, stop, faster: () => change({ bpm: nudgeBpm(s.bpm, 5) }), slower: () => change({ bpm: nudgeBpm(s.bpm, -5) }) }, { playing: running });
  // The engine stopped or the app left (its clicks are gone): stop and say so. Never restarts by itself (§4).
  useAudioInterruptions(running, () => { stop(); setError(STOPPED_NOTE); });

  return (
    <Screen withSidebar={false} testID="screen-practice-metronome">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <Button label="Practice" emoji="←" size="small" onPress={() => { stop(); if (router.canGoBack()) router.back(); else router.replace('/practice'); }} testID="metronome-back" />
        <Display size={28}>🔔 Metronome</Display>
        <Body color={color.ink} weight="700">Just the click: no take, no score.</Body>
      </View>
      <View style={styles.body}>
        <Card style={styles.tempoCard}>
          <View style={styles.tempoRow}>
            <RoundButton size="large" glyph="−" label="5 BPM slower" onPress={() => change({ bpm: nudgeBpm(s.bpm, -5) })} onLongPress={() => change({ bpm: nudgeBpm(s.bpm, -1) })} testID="metronome-slower" />
            <View style={styles.bpmBox} accessible accessibilityLabel={`${s.bpm} BPM`}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.bpm, tabular]}>{s.bpm}</Text>
              <Body weight="800" color={color.muted}>BPM</Body>
            </View>
            <RoundButton size="large" glyph="+" label="5 BPM faster" onPress={() => change({ bpm: nudgeBpm(s.bpm, 5) })} onLongPress={() => change({ bpm: nudgeBpm(s.bpm, 1) })} testID="metronome-faster" />
          </View>
          <Body size={13} color={color.muted}>Hold − or + for 1 BPM steps.</Body>
          <View style={styles.dots} accessibilityLabel={running && beat >= 0 ? `Click ${beat + 1} of ${clicks}` : 'Stopped'}>
            {Array.from({ length: clicks }, (_, i) => (
              <View key={i} style={[styles.dot, i === 0 && styles.dotOne, running && beat === i && styles.dotOn]} />
            ))}
          </View>
          <View style={styles.moves}>
            <BigMove tone="go" emoji={running ? '⏹' : '▶'} label={running ? 'Stop' : 'Start'} gestures={gesturesFor(running ? 'stop' : 'yes')} onPress={toggle} testID="metronome-toggle" style={styles.flex} />
            <BigMove tone="alt" emoji="👆" label="Tap" note="tap the beat 3 times or more" onPress={tap} testID="metronome-tap" style={styles.flex} />
          </View>
          <View style={styles.gest}>
            <Body size={13} weight="700">From the kit:</Body>
            <Body size={13}>{running ? 'crash × 4 stops' : 'tom 1 × 2 faster · floor × 2 slower'}</Body>
          </View>
          {error ? <Notice text={error} onClose={() => setError('')} testID="metronome-error" /> : null}
        </Card>
        <Card style={styles.setCard}>
          <CardTitle size={18}>Meter</CardTitle>
          <Segmented testID="metronome-meter" accessibilityLabel="Meter" value={meterLabel(s.timeSignature)}
            onChange={v => change({ timeSignature: METERS.find(m => meterLabel(m) === v) ?? s.timeSignature })}
            options={METERS.map(m => ({ value: meterLabel(m), label: meterLabel(m) }))} />
          <CardTitle size={18}>Clicks per beat</CardTitle>
          <Segmented testID="metronome-subdivision" accessibilityLabel="Clicks per beat" value={String(s.subdivision)} onChange={v => change({ subdivision: Number(v) as 1 | 2 | 4 })}
            options={SUBDIVISIONS.map(x => ({ value: String(x.value), label: x.label }))} />
          <Body size={13} color={color.muted}>The first click of each bar is higher; 7/8 clicks every 8th (2+2+3). The click's volume is in Setup → Sound.</Body>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  body: { flex: 1, flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  tempoCard: { flex: 1, gap: 14, alignItems: 'center', paddingVertical: 20 },
  tempoRow: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  bpmBox: { alignItems: 'center', minWidth: 190 },
  bpm: { fontSize: 110, fontWeight: '900', color: color.ink, lineHeight: 118 },
  dots: { flexDirection: 'row', gap: 14, marginVertical: 6 },
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel },
  dotOne: { width: 42, height: 42, borderRadius: 21 },
  dotOn: { backgroundColor: color.pop },
  moves: { flexDirection: 'row', gap: 14, alignSelf: 'stretch' },
  flex: { flex: 1 },
  gest: { flexDirection: 'row', gap: 6 },
  setCard: { width: 360, gap: 12 },
});
