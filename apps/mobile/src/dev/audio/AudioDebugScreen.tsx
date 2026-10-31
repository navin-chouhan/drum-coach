// The audio debug screen (A4): start the engine and read the route, check the clock against DrumMidi's, run a
// metronome built from AudioPort.schedule, hit touch pads (playNow), prepare and say count-in words, run the T6-8
// timing probe, play a backing file in sync with the click and watch its drift (Backing card), and watch the
// scheduler's stats. Owner checks: modules/drum-audio/CHECKS.md.
import type { AudioInterruption, AudioRoute, SoundId } from '@drum-coach/core/play/audioPort';
import type { PadId } from '@drum-coach/core/engine/kit';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { summarizeTiming, type TimingSummary } from '../../../modules/drum-audio/src/timingProbe';
import { available as midiAvailable, nowMs as midiNowMs } from '../../../modules/drum-midi';
import { audio } from '../../platform/audio';
import { colors } from '../../theme';
import { createDriftRecorder, loopSegments, nextBarAt, toneBpm, DRIFT_WINDOW_MS, type DriftRecorder } from './backingProbe';
import { createMetronome, type Metronome, type MetronomeSpec } from './metronome';

const PADS: { id: PadId; label: string }[] = [
  { id: 'kick', label: 'Kick' }, { id: 'snare', label: 'Snare' }, { id: 'hhClosed', label: 'HH closed' },
  { id: 'hhOpen', label: 'HH open' }, { id: 'hhPedal', label: 'HH pedal' }, { id: 'tom1', label: 'Tom 1' },
  { id: 'tom2', label: 'Tom 2' }, { id: 'floor', label: 'Floor' }, { id: 'crash', label: 'Crash' }, { id: 'ride', label: 'Ride' },
];
const COUNT_IN = ['one', 'two', 'three', 'four', 'and'];
const BACKING_RATES = [1, 0.75, 0.5];
/** The test tone covers the 2-minute drift window plus a little (whole 4-bar phrases). */
const TONE_SECONDS = DRIFT_WINDOW_MS / 1000 + 10;
type LoadedTone = { durationMs: number; sampleRate: number; bpm: number; beatsPerBar: number; rate: number };
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
  const [backingRate, setBackingRate] = useState(1);
  const [tone, setTone] = useState<LoadedTone | null>(null);
  const [backingMsg, setBackingMsg] = useState('');
  const drift = useRef<{ rec: DriftRecorder; polling: boolean } | null>(null);

  const log = useCallback((line: string) => setEvents(e => [`${new Date().toLocaleTimeString()} ${line}`, ...e].slice(0, 12)), []);

  useEffect(() => {
    const offRoute = audio.onRouteChange(r => {
      setRoute(r);
      log(`route → ${r.name} (${r.kind}, ${r.key}) out ${fmt(r.outputLatencyMs)} io ${fmt(r.ioBufferMs)}`);
      // Native cancelled everything queued; a take would end here (AUDIO-DESIGN §3.3).
      metro.current?.stop();
      setMetroOn(false);
    });
    const offInt = audio.onInterruption((e: AudioInterruption) => {
      log(`interruption ${e.type}${'reason' in e && e.reason ? ` (${e.reason})` : ''}${'cause' in e ? ` (${e.cause})` : ''}`);
      if (e.type !== 'ended') {
        metro.current?.stop();
        setMetroOn(false);
      }
    });
    // The metronome's ~10 Hz tick (and the backing anchor's, as core's take tick will read it), and the stats refresh.
    const tick = setInterval(() => {
      metro.current?.tick(audio.clock.now());
      const d = drift.current;
      if (d?.polling) d.polling = d.rec.poll();
    }, 100);
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

  const loadTone = async () => {
    const b = audio.backing;
    if (!b) return setBackingMsg('needs the native module');
    try {
      setBackingMsg('writing the test tone…');
      const bpm = toneBpm(spec.bpm, backingRate);
      const uri = await b.testTone(bpm, spec.beatsPerBar, TONE_SECONDS);
      const r = await b.load(uri);
      setTone({ ...r, bpm, beatsPerBar: spec.beatsPerBar, rate: backingRate });
      setBackingMsg(`loaded ${fmt(r.durationMs / 1000)} s at ${fmt(r.sampleRate, 0)} Hz`);
    } catch (e) {
      setBackingMsg(`failed: ${String(e)}`);
    }
  };

  /** `loop`: the tone's first bar, then the same bar queued again and again for the drift window (F2's seams). */
  const startBacking = async (loop = false) => {
    const b = audio.backing;
    if (!b || !tone) return setBackingMsg('load the test tone first');
    if (tone.rate !== backingRate || tone.bpm !== toneBpm(spec.bpm, backingRate) || tone.beatsPerBar !== spec.beatsPerBar) {
      return setBackingMsg('the tempo, meter or rate changed: load the test tone again');
    }
    try {
      await audio.start();
    } catch (e) {
      return setError(String(e));
    }
    const now = audio.clock.now();
    const lead = Math.max(300, (audio.route()?.minLeadMs ?? 0) + 100);
    const m = metro.current;
    const barMs = (spec.beatsPerBar * 60_000) / spec.bpm;
    const at = m?.running ? nextBarAt(m.zero, barMs, now, lead) : now + lead;
    const req = loop ? { at, offsetMs: 0, rate: backingRate, durationMs: barMs * backingRate } : { at, offsetMs: 0, rate: backingRate };
    b.start(req);
    const s = b.lastStart();
    if (s && !s.ok) return setBackingMsg(`not started: ${s.reason}`);
    if (loop) {
      for (const seg of loopSegments(req, barMs, Math.ceil(DRIFT_WINDOW_MS / barMs) + 1)) b.queue(seg);
      const q = b.lastQueue();
      if (q && !q.ok) return setBackingMsg(`loop not queued: ${q.reason}`);
    }
    drift.current = { rec: createDriftRecorder(b, req, DRIFT_WINDOW_MS, loop ? barMs : undefined), polling: true };
    const what = loop ? 'loops bar 1' : 'starts';
    setBackingMsg(m?.running ? `${what} on the next bar (in ${fmt(req.at - now, 0)} ms)` : `${what} now (metronome off: no click to line up with)`);
  };

  const stopBacking = () => {
    audio.backing?.stop();
    if (drift.current) drift.current.polling = false;
    setBackingMsg('stopped');
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
  const backingInfo = (info.backing ?? {}) as Record<string, unknown>;
  const lastStart = audio.backing?.lastStart() ?? null;
  const ds = drift.current?.rec.summary();

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

        <Card title="Backing (BackingPort)">
          <Text style={styles.hint}>
            A 4-bar test tone (beat blips, 44.1 kHz so the rate conversion runs) written for the metronome's tempo and
            started on its next bar: its beats should sit on the click. Drift = anchor() against the requested line,
            read 10×/s for 2 minutes (speaker: |drift| under 1 ms, slope about 0; other routes may slope, core follows).
          </Text>
          <View style={styles.buttons}>
            {BACKING_RATES.map(r => (
              <Button key={r} label={`${r * 100}%`} tone={backingRate === r ? 'primary' : 'plain'} onPress={() => setBackingRate(r)} />
            ))}
          </View>
          <View style={styles.buttons}>
            <Button testID="backing-load" label="Load test tone" tone="plain" onPress={loadTone} />
            <Button testID="backing-start" label="Start on next bar" onPress={() => startBacking()} />
            <Button testID="backing-loop" label="Loop 1 bar" tone="plain" onPress={() => startBacking(true)} />
            <Button testID="backing-stop" label="Stop" tone="plain" onPress={stopBacking} />
          </View>
          <Row label="State" value={backingMsg || (audio.backing ? '–' : 'needs the native module')} />
          <Row label="File" value={tone ? `${fmt(tone.durationMs / 1000)} s, ${fmt(tone.sampleRate, 0)} Hz, written at ${fmt(tone.bpm)} BPM for ${tone.rate * 100}%` : '–'} />
          <Row label="Plan" value={lastStart?.ok
            ? `frame ${fmt(lastStart.startFrame, 0)}, joined late ${fmt(lastStart.joinedLateMs, 1)} ms, time-pitch ${fmt(lastStart.pitchLatencyMs, 2)} ms, ${lastStart.nodeTime ? 'node-time start' : 'host-time start'}`
            : lastStart ? `not started: ${lastStart.reason}` : '–'} />
          <Row label="Drift now / smoothed" value={ds && ds.n > 0 ? `${fmt(ds.lastMs, 3)} / ${fmt(ds.smoothedMs, 3)} ms` : '–'} />
          <Row label="Drift min / max" value={ds && ds.n > 0 ? `${fmt(ds.minMs, 3)} / ${fmt(ds.maxMs, 3)} ms` : '–'} />
          <Row label="Slope" value={ds && ds.n > 1 ? `${fmt(ds.slopeMsPerMin, 3)} ms per minute` : '–'} />
          <Row label="Readings" value={ds ? `${ds.n} over ${fmt(ds.elapsedMs / 1000, 0)} of ${DRIFT_WINDOW_MS / 1000} s${ds.done ? ' (done)' : ''}` : '–'} />
          <Row label="Native" value={`starts ${fmt(backingInfo.starts, 0)}, late joins ${fmt(backingInfo.lateJoins, 0)}, re-anchors ${fmt(backingInfo.reanchors, 0)}, queued ${fmt(backingInfo.queued, 0)} (gaps ${fmt(backingInfo.queueGaps, 0)}, skips ${fmt(backingInfo.queueSkips, 0)}), playing ${String(backingInfo.playing ?? '–')}`} />
          <Row label="Native error" value={typeof backingInfo.lastError === 'string' && backingInfo.lastError !== '' ? backingInfo.lastError : '–'} />
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
