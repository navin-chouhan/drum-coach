import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button, Platform, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import * as DrumMidi from './modules/drum-midi';
import pkg from './package.json';
import { getInputs, getLogRealtime, lifecycle, probe, refreshInputs, select, setLogRealtime, start, subscribeInputs } from './src/probe/engine';
import { TapTest } from './src/probe/TapTest';
import { relativeMessages, tapTestFixture, type ProbeResults, type TapTestRun } from './src/shared/results';
import type { Summary } from './src/shared/stats';

const fmtMs = (s: Summary | null) => (s ? `min ${s.min} · median ${s.median} · p95 ${s.p95} · max ${s.max} ms (n ${s.n})` : '—');

export default function App() {
  const { inputs, selectedId } = useSyncExternalStore(subscribeInputs, getInputs);
  const [, setTick] = useState(0);
  const [runs, setRuns] = useState<TapTestRun[]>([]);
  const [network, setNetwork] = useState(false);
  const [realtimeLog, setRealtimeLog] = useState(getLogRealtime());
  const [note, setNote] = useState<string>();

  useEffect(() => { start(); }, []);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 250); return () => clearInterval(t); }, []); // the probe updates outside React

  const c = probe.counters;
  const selected = inputs.find(i => i.id === selectedId);
  const debug = DrumMidi.getDebugInfo();

  function results(): ProbeResults {
    const constants = Platform.constants as { interfaceIdiom?: string; osVersion?: string; systemName?: string };
    return {
      kind: 'drum-coach-gate0-probe', version: 1, createdAt: new Date().toISOString(),
      app: { platform: Platform.OS, osVersion: Platform.Version, model: constants.interfaceIdiom, expoSdk: pkg.dependencies.expo },
      moduleAvailable: DrumMidi.available, selected, inputs, networkSessionEnabled: network,
      counters: { ...c }, framer: { droppedBytes: c.droppedBytes, sysex: c.sysex },
      bridgeDelayMs: probe.bridge.summary(), nativeDelayMs: probe.native.summary(), audio: DrumMidi.getAudioInfo() ?? undefined,
      tapTests: runs, debug: { ...(debug ?? {}), lifecycle: { ...lifecycle } },
      lastMessages: relativeMessages(probe.capture), lastLog: [...probe.log], noteLog: [...probe.noteLog],
    };
  }

  async function copy(text: string, what: string) {
    try { await Clipboard.setStringAsync(text); setNote(`${what} copied (${text.length} characters). Paste it back to Claude.`); }
    catch (e) { setNote(`Copy failed: ${String(e)}. Use Share instead.`); }
  }

  return (
    <ScrollView contentContainerStyle={s.page}>
      <StatusBar style="auto" />
      <Text style={s.h1}>Drum Coach · MIDI probe (Gate 0)</Text>
      {!DrumMidi.available && <Text style={s.warn}>The native DrumMidi module isn't in this build (Expo Go, Android or web). Build the iOS development client: see docs/mobile/GATE0-CHECKLIST.md.</Text>}

      <Section title="Devices">
        {inputs.length === 0 && <Text style={s.small}>No MIDI sources. Plug the kit in (USB-C adapter) and switch the module on.</Text>}
        {inputs.map(i => (
          <View key={i.id} style={s.row}>
            <Text style={[s.dot, { color: i.online ? '#15803d' : '#b91c1c' }]}>●</Text>
            <Text style={s.grow}>{i.name}{i.manufacturer ? ` (${i.manufacturer})` : ''} · id {i.id} · {i.online ? 'online' : 'offline'}</Text>
            <Button title={i.id === selectedId ? 'Selected' : 'Select'} disabled={i.id === selectedId} onPress={() => select(i.id)} />
          </View>
        ))}
        <View style={s.row}>
          <Button title="Refresh" onPress={refreshInputs} />
          <Button title="Select none" onPress={() => select(null)} disabled={!selectedId} />
        </View>
        <View style={s.row}>
          <Text style={s.grow}>Network MIDI session (Mac → iPad, M8){debug?.networkSessionName ? ` · "${debug.networkSessionName}"` : ''}</Text>
          <Switch value={network} onValueChange={v => setNetwork(DrumMidi.setNetworkSessionEnabled(v))} disabled={!DrumMidi.available} />
        </View>
        {debug && <Text style={s.small}>native: connected {String(debug.connected)} {debug.connectedName} · connects {debug.connectCalls} · disconnects {debug.disconnectCalls} · setup notes {debug.setupNotifications} · packets {debug.packetsReceived} (ts=0: {debug.zeroTimestampPackets}) · timebase {debug.timebase} · background {lifecycle.backgrounded}× / foreground {lifecycle.foregrounded}×</Text>}
      </Section>

      <Section title="Counters (counted in JS from the raw bytes)">
        <Text style={s.mono}>hits {c.hits} · note-on {c.noteOn} · filtered (bounce/crosstalk) {c.filtered}</Text>
        <Text style={s.mono}>note-off {c.noteOff} (of which note-on vel 0: {c.noteOnVel0}) · poly AT {c.polyAftertouch} (choke {c.choke})</Text>
        <Text style={s.mono}>clock F8 {c.clock} · active sensing FE {c.activeSensing} · other realtime {c.otherRealtime}</Text>
        <Text style={s.mono}>off channel 10 {c.offChannel} · CC {c.controlChange} · sysex {c.sysex} · other {c.other} · dropped bytes {c.droppedBytes} · time went back {c.timeWentBack}</Text>
        <Text style={s.mono}>events {c.events} · messages {c.messages}</Text>
        <Button title="Reset counters and log" onPress={() => { probe.resetCounters(); setTick(x => x + 1); }} />
      </Section>

      <Section title="Bridge delay">
        <Text style={s.mono}>JS − host: {fmtMs(probe.bridge.summary())}</Text>
        <Text style={s.mono}>native − host: {fmtMs(probe.native.summary())}</Text>
        <Button title="Reset delay stats" onPress={() => { probe.resetDelay(); setTick(x => x + 1); }} />
      </Section>

      <Section title="Tap-to-click test">
        <TapTest runs={runs} onRun={r => setRuns(rs => [...rs, r])} />
      </Section>

      <Section title="Results">
        <View style={s.row}>
          <Button title="Copy results" onPress={() => copy(JSON.stringify(results()), 'Results')} />
          <Button title="Share…" onPress={() => { void Share.share({ message: JSON.stringify(results()) }); }} />
          <Button title="Copy last tap test as fixture" disabled={!runs.length}
            onPress={() => copy(JSON.stringify(tapTestFixture(runs[runs.length - 1], probe.capture, `ios-tap-test-${new Date().toISOString().slice(0, 10)}`)), 'Fixture')} />
        </View>
        {note && <Text style={s.small}>{note}</Text>}
      </Section>

      <Section title="Last 50 messages">
        <View style={s.row}>
          <Text style={s.grow}>Show clock and active sensing in the log</Text>
          <Switch value={realtimeLog} onValueChange={v => { setLogRealtime(v); setRealtimeLog(v); }} />
        </View>
        {probe.log.map(e => (
          <Text key={e.seq} style={[s.mono, e.verdict === 'hit' ? s.hit : e.verdict === 'filtered' ? s.filtered : null]}>
            {e.hostTimeMs.toFixed(1).padStart(12)}  {e.hex.padEnd(9)}  {e.kind}{e.channel ? ` ch${e.channel}` : ''}
            {e.note !== undefined ? ` n${e.note}` : ''}{e.velocity !== undefined ? ` v${e.velocity}` : ''}{e.value !== undefined ? ` val${e.value}` : ''}
            {e.padName ? ` ${e.padName}` : ''}{e.verdict ? ` [${e.verdict}]` : ''}
          </Text>
        ))}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.h2}>{title}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  page: { padding: 20, paddingTop: 60, gap: 16 },
  h1: { fontSize: 22, fontWeight: '700' },
  h2: { fontSize: 17, fontWeight: '600', marginBottom: 6 },
  section: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#bbb', borderRadius: 8, padding: 12, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  grow: { flex: 1 },
  dot: { fontSize: 16 },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  hit: { color: '#15803d' },
  filtered: { color: '#b45309' },
  small: { fontSize: 12, color: '#555' },
  warn: { color: '#b45309' },
});
