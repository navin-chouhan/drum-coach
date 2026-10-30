// MIDI debug screen (Phase 1 gate: "the kit lists and logs hits in the app"). Devices with select, a live hit log,
// counters, batch and bridge-delay stats, and "Copy debug info" (the share sheet, which has Copy).
// Renders from a snapshot taken 4 times a second: clock messages and hits never re-render it directly (B24).
import { PADS, PAD_INFO, type PadId } from '@drum-coach/core/engine/kit';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createMidiDebugSession, type MidiDebugSession, type MidiSnapshot } from '../../src/dev/midiSession';
import { DEFAULT_PREFERRED_NAMES, getMidiPort } from '../../src/platform/midi';
import type { Summary } from '../../src/platform/samples';
import { colors } from '../../src/theme';

const REFRESH_MS = 250;

function Button({ title, onPress, testID, disabled }: { title: string; onPress: () => void; testID?: string; disabled?: boolean }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

function Card({ title, testID, children }: { title: string; testID?: string; children: ReactNode }) {
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{String(value)}</Text>
    </View>
  );
}

const fmt = (s: Summary | null) => (s ? `median ${s.median} · p95 ${s.p95} · max ${s.max} ms (n ${s.n})` : 'no samples yet');
const num = (x: unknown) => (typeof x === 'number' ? Math.round(x * 100) / 100 : typeof x === 'string' || typeof x === 'boolean' ? String(x) : '–');

export default function MidiDebug() {
  const port = getMidiPort();
  const session = useRef<MidiDebugSession | null>(null);
  const [snap, setSnap] = useState<MidiSnapshot | null>(null);
  const [network, setNetwork] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const s = createMidiDebugSession(port);
    session.current = s;
    const offInputs = port.onInputsChanged(() => setSnap(s.snapshot()));
    const timer = setInterval(() => setSnap(s.snapshot()), REFRESH_MS); // the first one too: the Devices card renders without it
    return () => {
      clearInterval(timer);
      offInputs();
      s.stop();
      session.current = null;
    };
  }, [port]);

  const refresh = () => { if (session.current) setSnap(session.current.snapshot()); };
  const select = (id: string | null) => {
    try { port.select(id); } catch (e) { setMessage(`Select failed: ${e instanceof Error ? e.message : String(e)}`); }
    refresh();
  };
  const tap = (pad: PadId) => { session.current?.tapPad(pad); refresh(); };
  const share = () => {
    const report = session.current?.report();
    if (!report) return;
    Share.share({ message: JSON.stringify({ at: new Date().toISOString(), ...report }, null, 2) })
      .then(() => setMessage('Debug info shared'))
      .catch((e: unknown) => setMessage(`Share failed: ${e instanceof Error ? e.message : String(e)}`));
  };

  const c = snap?.counters;
  const n = snap?.native ?? {};
  const sel = snap?.selection;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <Stack.Screen options={{ title: 'MIDI debug' }} />
      <ScrollView contentContainerStyle={styles.content}>
        {!port.available && (
          <Text style={styles.warn} testID="dev-midi-unavailable">
            The native DrumMidi module isn&apos;t in this build (simulator without it, Expo Go, Android or web). The pads
            below still go through the hit path.
          </Text>
        )}
        {message ? <Text style={styles.note}>{message}</Text> : null}

        <Card title="Devices" testID="dev-midi-devices">
          {snap && snap.inputs.length === 0 && (
            <Text style={styles.muted} testID="dev-midi-no-devices">
              No MIDI sources. Plug the kit into the iPad&apos;s USB-C port and switch it on.
            </Text>
          )}
          {snap?.inputs.map(i => {
            const connected = sel?.connectedId === i.id;
            return (
              <View key={i.id} style={styles.device} testID={`dev-midi-device-${i.id}`}>
                <View style={styles.deviceText}>
                  <Text style={styles.deviceName}>{i.name}</Text>
                  <Text style={styles.muted}>
                    {i.manufacturer || 'unknown maker'} · id {i.id} · {i.online ? 'online' : 'offline'}
                    {connected ? ' · connected' : sel?.selectedId === i.id ? ' · selected' : ''}
                  </Text>
                </View>
                <Button title={connected ? 'Connected' : 'Select'} disabled={connected || !i.online} onPress={() => select(i.id)} />
              </View>
            );
          })}
          <View style={styles.row}>
            <Button title="Select none" onPress={() => select(null)} disabled={!port.available} testID="dev-midi-select-none" />
            <Button
              title={`Auto-select ${DEFAULT_PREFERRED_NAMES.join(', ')}`}
              onPress={() => { port.setPreferredNames(DEFAULT_PREFERRED_NAMES); refresh(); }}
              disabled={!port.available}
              testID="dev-midi-auto-select"
            />
          </View>
          <Text style={styles.muted}>
            Auto-select {sel?.autoSelect ? `on (${sel.preferredNames.join(', ')})` : 'off'}
          </Text>
          <View style={styles.row}>
            <Text style={styles.label}>Network MIDI session (Mac → iPad)</Text>
            <Switch value={network} disabled={!port.available} onValueChange={v => setNetwork(port.setNetworkSessionEnabled(v))} />
          </View>
        </Card>

        <Card title="Hits" testID="dev-midi-hitlog">
          <Text style={styles.muted}>Pads without the kit (same hit path):</Text>
          <View style={styles.pads}>
            {PADS.map(p => (
              <Pressable key={p} testID={`dev-midi-pad-${p}`} onPress={() => tap(p)} style={({ pressed }) => [styles.pad, pressed && styles.pressed]}>
                <Text style={styles.padText}>{PAD_INFO[p].name}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>{snap ? `${snap.hits} hits` : ''}</Text>
          {snap?.log.length === 0 && <Text style={styles.muted}>Hit a pad.</Text>}
          {snap?.log.map((h, i) => (
            <Text key={`${h.atMs}-${i}`} style={styles.mono}>
              {`${(h.atMs / 1000).toFixed(3).padStart(9)} s  ${h.name.padEnd(14)} vel ${String(h.velocity).padStart(3)}  note ${h.note}`}
              {h.sinceLastMs == null ? '' : `  +${h.sinceLastMs} ms`}
              {h.emulated ? '  (screen)' : ''}
            </Text>
          ))}
        </Card>

        <Card title="Delays" testID="dev-midi-delays">
          <Stat label="Hit → JS (host time to JS)" value={fmt(snap?.delays.hit ?? null)} />
          <Stat label="Bridge (native send → JS)" value={fmt(snap?.delays.bridge ?? null)} />
          <Stat label="Native batching hold" value={fmt(snap?.delays.hold ?? null)} />
          <Text style={styles.muted}>M6 target: hit → JS p95 under 20 ms. Scoring uses host time, so this is responsiveness only.</Text>
        </Card>

        <Card title="Counters" testID="dev-midi-counters">
          <View style={styles.grid}>
            <Stat label="Batches" value={c?.batches ?? 0} />
            <Stat label="Packets" value={c?.packets ?? 0} />
            <Stat label="Messages" value={c?.messages ?? 0} />
            <Stat label="Note-ons" value={c?.noteOns ?? 0} />
            <Stat label="Clock (F8)" value={c?.clock ?? 0} />
            <Stat label="Active sensing (FE)" value={c?.activeSensing ?? 0} />
            <Stat label="Stale dropped (resume)" value={c?.staleDropped ?? 0} />
            <Stat label="Oldest stale, ms" value={num(c?.staleMaxAgeMs)} />
            <Stat label="Time went back" value={c?.timeWentBack ?? 0} />
            <Stat label="Dropped bytes" value={c?.framer.droppedBytes ?? 0} />
            <Stat label="Max batch (JS)" value={c?.maxBatchPackets ?? 0} />
            <Stat label="Batch reasons" value={c ? Object.entries(c.batchReasons).map(([k, v]) => `${k} ${v}`).join(', ') || '–' : '–'} />
          </View>
        </Card>

        <Card title="Native" testID="dev-midi-native">
          <View style={styles.grid}>
            <Stat label="Connected" value={`${num(n.connected)} ${typeof n.connectedName === 'string' ? n.connectedName : ''}`} />
            <Stat label="Connect / disconnect" value={`${num(n.connectCalls)} / ${num(n.disconnectCalls)}`} />
            <Stat label="Setup notifications" value={num(n.setupNotifications)} />
            <Stat label="Packets received" value={num(n.packetsReceived)} />
            <Stat label="ts = 0 packets" value={num(n.zeroTimestampPackets)} />
            <Stat label="Native batches" value={num(n.batches)} />
            <Stat label="Flush note-on / deadline / full" value={`${num(n.flushNoteOn)} / ${num(n.flushDeadline)} / ${num(n.flushFull)}`} />
            <Stat label="Max hold, ms" value={num(n.maxHoldMs)} />
            <Stat label="Max batch" value={num(n.maxBatchPackets)} />
            <Stat label="Timebase" value={num(n.timebase)} />
            <Stat label="Last error" value={num(n.lastError)} />
          </View>
          <Text style={styles.muted}>{typeof n.batchPolicy === 'string' ? n.batchPolicy : ''}</Text>
        </Card>

        <View style={styles.row}>
          <Button title="Copy debug info" onPress={share} testID="dev-midi-copy" />
          <Button title="Reset counters" onPress={() => { session.current?.reset(); refresh(); }} testID="dev-midi-reset" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 16, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  device: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceText: { flex: 1 },
  deviceName: { fontSize: 18, fontWeight: '600', color: colors.text },
  label: { fontSize: 16, color: colors.text },
  muted: { fontSize: 14, color: colors.muted },
  warn: { fontSize: 15, color: colors.warn },
  note: { fontSize: 15, color: colors.primary },
  mono: { fontFamily: 'Menlo', fontSize: 14, color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { minWidth: 220, gap: 2 },
  statLabel: { fontSize: 13, color: colors.muted },
  statValue: { fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  pads: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pad: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14 },
  padText: { fontSize: 15, color: colors.text },
  button: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});
