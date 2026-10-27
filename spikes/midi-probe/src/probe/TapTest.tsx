import { useEffect, useRef, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import * as DrumMidi from '../../modules/drum-midi';
import { TAP_TEST, type TapTestResult } from '../shared/latency';
import type { TapTestRun } from '../shared/results';
import { buildTapTestRun, planTapTest, tapTestEndMs } from '../shared/tapTest';
import { probe } from './engine';

const fmt = (r: TapTestResult) => r
  ? `median ${r.latencyMs} ms · mean ${r.meanMs} ms · spread ±${r.spread} ms · n ${r.n}${r.trusted ? '' : ' (not steady enough to trust)'}`
  : 'not enough taps near the clicks';

/** 120 BPM: 4 count-in clicks, then tap the snare with the next 32. Clicks and hits share the host clock. */
export function TapTest({ runs, onRun }: { runs: TapTestRun[]; onRun: (r: TapTestRun) => void }) {
  const [state, setState] = useState<'idle' | 'running'>('idle');
  const [taps, setTaps] = useState(0);
  const [error, setError] = useState<string>();
  const cancel = useRef<() => void>(() => {});
  useEffect(() => () => cancel.current(), []);

  async function run() {
    setError(undefined);
    const plan = planTapTest(DrumMidi.nowMs(), TAP_TEST);
    const snare: number[] = [];
    let ignored = 0;
    const off = probe.onHit(h => { if (h.pad === 'snare') { snare.push(h.time); setTaps(snare.length); } else ignored++; });
    try {
      const schedule = await DrumMidi.scheduleClicks(plan.startHostMs, plan.bpm, plan.total, 4);
      setState('running'); setTaps(0);
      const timer = setTimeout(() => {
        off();
        const audio = { outputLatencyMs: schedule.outputLatencyMs, ioBufferMs: schedule.ioBufferMs, sampleRate: schedule.sampleRate, route: schedule.route };
        onRun(buildTapTestRun(plan, schedule.scheduledHostTimesMs, audio, snare));
        if (ignored) setError(`${ignored} hits on other pads were ignored (snare only).`);
        setState('idle');
      }, Math.max(0, tapTestEndMs(plan) - DrumMidi.nowMs()));
      cancel.current = () => { off(); clearTimeout(timer); DrumMidi.stopClicks(); };
    } catch (e) {
      off();
      setError(String(e));
      setState('idle');
    }
  }

  const last = runs[runs.length - 1];
  return (
    <View>
      <Text style={s.p}>Press Start, listen to the 4 count-in clicks, then hit the snare exactly with each of the next {TAP_TEST.clicks} clicks
        ({TAP_TEST.bpm} BPM). Play along with the clicks rather than reacting to them. Use the headphones or speaker you'll practise with.</Text>
      <View style={s.row}>
        <Button title={state === 'running' ? `Tap along… ${taps}/${TAP_TEST.clicks}` : 'Start tap test'} onPress={run}
          disabled={state === 'running' || !DrumMidi.available} />
        {state === 'running' && <Button title="Stop" onPress={() => { cancel.current(); setState('idle'); }} />}
      </View>
      {!DrumMidi.available && <Text style={s.warn}>Needs the iOS development build (native clicks).</Text>}
      {error && <Text style={s.warn}>{error}</Text>}
      {last && (
        <View>
          <Text style={s.b}>Last run ({last.tapMs.length} snare hits, output latency {last.audio.outputLatencyMs.toFixed(1)} ms, IO buffer {last.audio.ioBufferMs.toFixed(1)} ms, {last.audio.sampleRate} Hz, {last.audio.route})</Text>
          <Text style={s.mono}>vs heard click (web-equivalent): {fmt(last.result)}</Text>
          <Text style={s.mono}>vs scheduled click (no output latency): {fmt(last.resultVsScheduled)}</Text>
        </View>
      )}
      {runs.length > 1 && <Text style={s.small}>Earlier runs: {runs.slice(0, -1).map(r => r.result ? `${r.result.latencyMs}±${r.result.spread}` : '—').join(', ')} ms</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  p: { fontSize: 14, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  warn: { color: '#b45309', marginTop: 6 },
  b: { fontWeight: '600', marginTop: 8 },
  mono: { fontFamily: 'Menlo', fontSize: 13, marginTop: 4 },
  small: { fontSize: 12, color: '#555', marginTop: 6 },
});
