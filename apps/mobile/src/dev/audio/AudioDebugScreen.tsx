// The audio debug screen (A4): start the engine and read the route, check the clock against DrumMidi's, run a
// metronome built from AudioPort.schedule, hit touch pads (playNow), prepare and say count-in words, run the T6-8
// timing probe, and watch the scheduler's stats. Owner checks: modules/drum-audio/CHECKS.md.
import type { AudioInterruption, AudioRoute, SoundId } from '@drum-coach/core/play/audioPort';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { summarizeTiming, type TimingSummary } from '../../../modules/drum-audio/src/timingProbe';
import { available as midiAvailable, nowMs as midiNowMs } from '../../../modules/drum-midi';
import { audio } from '../../platform/audio';
import { colors } from '../../theme';
import { createMetronome, type Metronome, type MetronomeSpec } from './metronome';

const PADS: { id: string; label: string }[] = [
  { id: 'kick', label: 'Kick' }, { id: 'snare', label: 'Snare' }, { id: 'hhClosed', label: 'HH closed' },
  { id: 'hhOpen', label: 'HH open' }, { id: 'hhPedal', label: 'HH pedal' }, { id: 'tom1', label: 'Tom 1' },
  { id: 'tom2', label: 'Tom 2' }, { id: 'floor', label: 'Floor' }, { id: 'crash', label: 'Crash' }, { id: 'ride', label: 'Ride' },
];
const COUNT_IN = ['one', 'two', 'three', 'four', 'and'];
const fmt = (x: unknown, digits = 1) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(digits) : String(x ?? '–'));

function Button({ label, onPress, onPressIn, testID, tone }: {
  label: string; onPress?: () => void; onPressIn?: () => void; testID?: string; tone?: 'primary' | 'plain' | 'pad';
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={onPressIn}
      style={({ pressed }) => [styles.button, tone === 'plain' && styles.plain, tone === 'pad' && styles.pad, pressed && styles.pressed]}
    >
      <Text style={[styles.buttonText, tone === 'plain' && styles.plainText]}>{label}</Text>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

/** DrumMidi.nowMs() − DrumAudio.nowMs(), read between two audio reads (CHECKS.md clock check). */
function clockCheck(): string {
  if (!audio.available || !midiAvailable) return 'needs both native modules';
  const a = audio.clock.now();
  const m = midiNowMs();
  const b = audio.clock.now();
  return `midi − audio = ${(m - (a + b) / 2).toFixed(4)} ms (read window ${(b - a).toFixed(4)} ms)`;
}

export function AudioDebugScreen() {
  const [route, setRoute] = useState<AudioRoute | null>(audio.route());
  const [error, setError] = useState<string>('');
  const [spec, setSpec] = useState<MetronomeSpec>({ bpm: 120, beatsPerBar: 4, subdivision: 1 });
  const [metroOn, setMetroOn] = useState(false);
  const [clock, setClock] = useState('');
  const [wordsState, setWordsState] = useState('not prepared');
  const [lastPad, setLastPad] = useState('');
  const [probe, setProbe] = useState<{ on: boolean; summary?: TimingSummary; detail?: string }>({ on: false });
  const [events, setEvents] = useState<string[]>([]);
  const [, setRefresh] = useState(0);
  const metro = useRef<Metronome | null>(null);

  const log = useCallback((line: string) => setEvents(e => [`${new Date().toLocaleTimeString()} ${line}`, ...e].slice(0, 12)), []);

  useEffect(() => {
    const offRoute = audio.onRouteChange(r => {
      setRoute(r);
      log(`route → ${r.name} (${r.kind}, ${r.key}) out ${fmt(r.outputLatencyMs)} io ${fmt(r.ioBufferMs)}`);
    });
    const offInt = audio.onInterruption((e: AudioInterruption) => {
      log(`interruption ${e.type}${'reason' in e && e.reason ? ` (${e.reason})` : ''}${'cause' in e ? ` (${e.cause})` : ''}`);
      if (e.type !== 'ended') {
        metro.current?.stop();
        setMetroOn(false);
      }
    });
    // The metronome's ~10 Hz tick, and the stats refresh.
    const tick = setInterval(() => metro.current?.tick(audio.clock.now()), 100);
    const refresh = setInterval(() => setRefresh(n => n + 1), 500);
    return () => {
      offRoute();
      offInt();
      clearInterval(tick);
      clearInterval(refresh);
      metro.current?.stop();
    };
  }, [log]);

  const start = useCallback(async () => {
    try {
      const r = await audio.start();
      setRoute(r);
      setError('');
      log(`started: ${r.name}, minLead ${fmt(r.minLeadMs)} ms`);
    } catch (e) {
      setError(String(e));
    }
  }, [log]);

  const toggleMetronome = useCallback(async () => {
    if (metro.current?.running) {
      metro.current.stop();
      setMetroOn(false);
      return;
    }
    try {
      await audio.start();
      const m = createMetronome(audio, spec);
      m.start(audio.clock.now());
      metro.current = m;
      setMetroOn(true);
    } catch (e) {
      setError(String(e));
    }
  }, [spec]);

  const changeSpec = (next: Partial<MetronomeSpec>) => {
    metro.current?.stop();
    setMetroOn(false);
    setSpec(s => ({ ...s, ...next, bpm: Math.min(300, Math.max(20, next.bpm ?? s.bpm)) }));
  };

  const pad = (sound: SoundId, label: string) => {
    const heard = audio.playNow(sound, 1);
    setLastPad(`${label}: heard ≈ now + ${fmt(heard - audio.clock.now())} ms`);
  };

  const prepareWords = async () => {
    setWordsState('rendering…');
    try {
      const r = await audio.prepareWords(COUNT_IN);
      setWordsState(r.missing.length ? `missing: ${r.missing.join(', ')}` : `ready: ${COUNT_IN.join(', ')}`);
    } catch (e) {
      setWordsState(`failed: ${String(e)}`);
    }
  };

  const toggleProbe = () => {
    if (!probe.on) {
      if (audio.startTimingProbe()) setProbe({ on: true });
      else setError('timing probe: start the engine first');
      return;
    }
    const r = audio.stopTimingProbe();
    if (!r) return setProbe({ on: false });
    setProbe({
      on: false,
      summary: summarizeTiming(r.scheduledMs, r.onsetsMs),
      detail: `${r.onsetsMs.length} onsets, ${r.scheduledMs.length} clicks, ${r.tapBuffers} tap buffers, ${r.noHostTime} without host time, ${r.sampleRate} Hz`,
    });
  };

  const stats = audio.stats();
  const info = audio.debugInfo() ?? {};
  const pools = (info.pools ?? {}) as Record<string, { nodes: number; busy: number }>;
  const m = metro.current;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card title="Engine and route">
          <Row label="Module" value={audio.available ? 'in this build' : 'not in this build'} />
          <View style={styles.buttons}>
            <Button testID="audio-start" label="Start engine" onPress={start} />
            <Button testID="audio-suspend" label="Suspend" tone="plain" onPress={() => { metro.current?.stop(); setMetroOn(false); audio.suspend(); }} />
          </View>
          {error !== '' && <Text style={styles.error}>{error}</Text>}
          <Row label="Output" value={route ? `${route.name} (${route.kind})` : '–'} />
          <Row label="Key" value={route?.key ?? '–'} />
          <Row label="Output latency" value={`${fmt(route?.outputLatencyMs, 2)} ms`} />
          <Row label="IO buffer" value={`${fmt(route?.ioBufferMs, 2)} ms`} />
          <Row label="Sample rate" value={`${fmt(route?.sampleRate, 0)} Hz`} />
          <Row label="Heard offset" value={`${fmt(route?.heardOffsetMs, 2)} ms (branch ${String(info.heardOffsetBranch ?? '?')})`} />
          <Row label="Min lead" value={`${fmt(route?.minLeadMs, 2)} ms`} />
        </Card>

        <Card title="Clock check">
          <View style={styles.buttons}>
            <Button testID="audio-clock" label="Compare with DrumMidi" tone="plain" onPress={() => setClock(clockCheck())} />
          </View>
          <Row label="Result" value={clock || '–'} />
        </Card>

        <Card title="Metronome (AudioPort.schedule)">
          <View style={styles.buttons}>
            <Button label="−5" tone="plain" onPress={() => changeSpec({ bpm: spec.bpm - 5 })} />
            <Button label="−1" tone="plain" onPress={() => changeSpec({ bpm: spec.bpm - 1 })} />
            <Text style={styles.big}>{spec.bpm} BPM</Text>
            <Button label="+1" tone="plain" onPress={() => changeSpec({ bpm: spec.bpm + 1 })} />
            <Button label="+5" tone="plain" onPress={() => changeSpec({ bpm: spec.bpm + 5 })} />
          </View>
          <View style={styles.buttons}>
            {([1, 2, 4] as const).map(s => (
              <Button key={s} label={['', 'Quarters', 'Eighths', '', 'Sixteenths'][s]} tone={spec.subdivision === s ? 'primary' : 'plain'}
                onPress={() => changeSpec({ subdivision: s })} />
            ))}
            {[3, 4].map(b => (
              <Button key={b} label={`${b}/4`} tone={spec.beatsPerBar === b ? 'primary' : 'plain'} onPress={() => changeSpec({ beatsPerBar: b })} />
            ))}
          </View>
          <View style={styles.buttons}>
            <Button testID="audio-metronome" label={metroOn ? 'Stop' : 'Start metronome'} onPress={toggleMetronome} />
          </View>
          <Row label="Handed / accepted / late" value={m ? `${m.stats.handed} / ${m.stats.accepted} / ${m.stats.late} in ${m.stats.calls} calls` : '–'} />
        </Card>

        <Card title="Touch pads (playNow)">
          <View style={styles.buttons}>
            {PADS.map(p => <Button key={p.id} label={p.label} tone="pad" onPressIn={() => pad(`drum.${p.id}`, p.label)} />)}
          </View>
          <View style={styles.buttons}>
            <Button label="Click bar" tone="plain" onPressIn={() => pad('click.bar', 'Click bar')} />
            <Button label="Click beat" tone="plain" onPressIn={() => pad('click.beat', 'Click beat')} />
            <Button label="Click sub" tone="plain" onPressIn={() => pad('click.sub', 'Click sub')} />
          </View>
          <Row label="Last" value={lastPad || '–'} />
        </Card>

        <Card title="Count-in words (AVSpeechSynthesizer)">
          <View style={styles.buttons}>
            <Button label="Prepare one…four, and" tone="plain" onPress={prepareWords} />
            {COUNT_IN.map(w => <Button key={w} label={w} tone="plain" onPressIn={() => pad(`word.${w}`, w)} />)}
          </View>
          <Row label="Words" value={wordsState} />
        </Card>

        <Card title="Timing probe (T6-8)">
          <Text style={styles.hint}>Start the metronome, start the probe, wait (5 minutes for T6-8), stop the probe.</Text>
          <View style={styles.buttons}>
            <Button testID="audio-probe" label={probe.on ? 'Stop probe' : 'Start probe'} onPress={toggleProbe} />
          </View>
          {probe.summary && (
            <>
              <Row label="Matched" value={`${probe.summary.matched} (unmatched: ${probe.summary.unmatchedScheduled} clicks, ${probe.summary.unmatchedOnsets} onsets)`} />
              <Row label="Offset (mean)" value={`${fmt(probe.summary.meanMs, 3)} ms`} />
              <Row label="|error| p99 / max" value={`${fmt(probe.summary.p99AbsMs, 3)} / ${fmt(probe.summary.maxAbsMs, 3)} ms (pass p99 < 0.5)`} />
              <Row label="Slope" value={`${fmt(probe.summary.slopeMsPer5Min, 3)} ms per 5 min over ${fmt(probe.summary.spanS, 0)} s (pass < 1)`} />
              <Row label="Detail" value={probe.detail ?? ''} />
            </>
          )}
        </Card>

        <Card title="Stats">
          <Row label="Scheduled" value={String(stats.scheduled)} />
          <Row label="Late / dropped" value={`${stats.late} / ${stats.dropped} (cut ${fmt(info.cut, 0)})`} />
          <Row label="Engine starts" value={String(stats.engineStarts)} />
          <Row label="Pending" value={fmt(info.pending, 0)} />
          <Row label="Pools" value={Object.entries(pools).map(([b, p]) => `${b} ${p.busy}/${p.nodes}`).join(' · ') || '–'} />
          <Row label="Loop" value={`${fmt(info.ticks, 0)} ticks, last gap ${fmt(info.lastTickGapMs, 2)} ms, max ${fmt(info.maxTickGapMs, 2)} ms`} />
          <Row label="Last error" value={stats.lastError || '–'} />
        </Card>

        <Card title="Events">
          {events.length === 0 ? <Text style={styles.hint}>Route changes and interruptions show here.</Text> :
            events.map((e, i) => <Text key={i} style={styles.mono}>{e}</Text>)}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 16, maxWidth: 980, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', gap: 16 },
  label: { width: 190, fontSize: 15, color: colors.muted },
  value: { flex: 1, fontSize: 15, color: colors.text, fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  button: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18 },
  plain: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  pad: { backgroundColor: colors.accent, minWidth: 110, paddingVertical: 22, alignItems: 'center' },
  pressed: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  plainText: { color: colors.primary },
  big: { fontSize: 22, fontWeight: '700', color: colors.text, minWidth: 110, textAlign: 'center' },
  hint: { fontSize: 14, color: colors.muted },
  error: { fontSize: 14, color: colors.warn },
  mono: { fontSize: 13, color: colors.text, fontFamily: 'Menlo' },
});
