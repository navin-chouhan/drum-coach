// Dev screen for sheet music (A6n): NotationView on a looping fake take, the same one /dev/play uses, with a
// Sheet/Highway toggle so the two views can be compared on the iPad. Open it at /dev/sheet.
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { markShowcase, moneyBeat } from '../../src/notation/dev/fixtures';
import { NotationView } from '../../src/notation';
import { useFixtureTake } from '../../src/play/dev/useFixtureTake';
import { NoteHighway, THEMES } from '../../src/play';

// Core-agnostic Clock for now: performance.now(). In the app this is MidiPort.clock.now (mach host ms).
const now = () => performance.now();
const CHARTS = { money: () => moneyBeat(4, 70), marks: () => markShowcase(80) } as const;

function Toggle({ label, value, onPress, testID }: { label: string; value: string; onPress: () => void; testID: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Text style={styles.toggleValue}>{value}</Text>
    </Pressable>
  );
}

export default function SheetDev() {
  const [which, setWhich] = useState<keyof typeof CHARTS>('money');
  const chart = useMemo(() => CHARTS[which](), [which]);
  const bpm = chart.bpm;
  const [view, setView] = useState<'sheet' | 'highway'>('sheet'); // Sheet first, as on the web (D8)
  const [hints, setHints] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [themeName, setThemeName] = useState<keyof typeof THEMES>('ipad');
  const theme = THEMES[themeName];
  const take = useFixtureTake(chart, bpm, now, autoplay);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Sheet music (dev)' }} />
      <View style={styles.bar}>
        <Text style={styles.title}>{chart.title} · {bpm} BPM · take {take.take + 1}</Text>
        <Toggle testID="sheet-dev-view" label="View" value={view === 'sheet' ? 'Sheet' : 'Highway'} onPress={() => setView(v => (v === 'sheet' ? 'highway' : 'sheet'))} />
        <Toggle testID="sheet-dev-chart" label="Chart" value={which === 'money' ? 'money beat' : 'every mark'} onPress={() => setWhich(w => (w === 'money' ? 'marks' : 'money'))} />
        <Toggle testID="sheet-dev-hints" label="Hints" value={hints ? 'on' : 'off'} onPress={() => setHints(h => !h)} />
        <Toggle testID="sheet-dev-theme" label="Colours" value={themeName === 'ipad' ? 'iPad' : 'web'} onPress={() => setThemeName(t => (t === 'ipad' ? 'web' : 'ipad'))} />
        <Toggle testID="sheet-dev-autoplay" label="Replay" value={autoplay ? 'on' : 'off'} onPress={() => setAutoplay(a => !a)} />
        <Toggle testID="sheet-dev-restart" label="Take" value="restart" onPress={take.restart} />
      </View>
      <View style={[styles.card, { backgroundColor: view === 'sheet' ? '#FFFDF6' : theme.background }]}>
        {view === 'sheet' ? (
          <NotationView testID="sheet-dev-notation" chart={chart} bpm={bpm} zero={take.zero} now={now} latencyMs={0} results={take.results.subscribe} theme={theme} hints={hints} />
        ) : (
          <NoteHighway testID="sheet-dev-highway" chart={chart} bpm={bpm} zero={take.zero} now={now} latencyMs={0} results={take.results.subscribe} theme={theme} />
        )}
      </View>
      <Text style={styles.note}>
        Check on the iPad: the cursor glides without stutter at 60/120 Hz and stays on the beat with the replay; notes turn
        green / orange / red as they're judged; a red ✕ marks the extra snare in bar 2; the page turns after bar 2 without a
        hitch; airplane mode changes nothing.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 16, gap: 12, backgroundColor: '#F2F2F7' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 19, fontWeight: '700', color: '#1C1C1E' },
  toggle: { minHeight: 44, minWidth: 92, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(120,120,128,0.16)', justifyContent: 'center' },
  toggleLabel: { fontSize: 12, color: 'rgba(60,60,67,0.7)', fontWeight: '600' },
  toggleValue: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
  pressed: { opacity: 0.6 },
  card: { flex: 1, borderRadius: 22, overflow: 'hidden', borderWidth: 3, borderColor: '#141414' },
  note: { fontSize: 13, color: 'rgba(60,60,67,0.7)' },
});
