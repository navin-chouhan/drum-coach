// Dev screen for the play surfaces (A6): the note highway, the kit view and the touch pads, driven by a looping fake
// take of "The money beat" so the owner can judge them on the iPad before the real screens exist (D4).
// Core-agnostic: a fixture chart, a timer and a tiny judge (src/play/dev). Open it at /dev/play.
import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { moneyBeat } from '../../src/play/dev/fixture';
import { useFixtureTake } from '../../src/play/dev/useFixtureTake';
import { KitView, NoteHighway, THEMES, TouchPads, useUiClock, type Flow } from '../../src/play';

const BPM = 70;
const ACTIVE = ['hihat', 'snare', 'kick'] as const;
// Core-agnostic Clock for now: performance.now(). In the app this is MidiPort.clock.now (mach host ms).
const now = () => performance.now();

function Toggle({ label, value, onPress, testID }: { label: string; value: string; onPress: () => void; testID: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Text style={styles.toggleValue}>{value}</Text>
    </Pressable>
  );
}

export default function PlayDev() {
  const chart = useMemo(() => moneyBeat(4, BPM), []);
  const [autoplay, setAutoplay] = useState(true);
  const [flow, setFlow] = useState<Flow>('leftward');
  const [themeName, setThemeName] = useState<keyof typeof THEMES>('ipad');
  const [sounds, setSounds] = useState(0);
  const theme = THEMES[themeName];
  const take = useFixtureTake(chart, BPM, now, autoplay);
  const clock = useUiClock(now); // one UI-thread clock for the screen
  const options = useMemo(() => ({ flow }), [flow]);
  // No AudioPort yet (A4): count the sounds the pads would play.
  const playNow = useCallback(() => {
    setSounds(n => n + 1);
    return now();
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: themeName === 'web' ? '#1E1E1E' : '#F2F2F7' }]} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Play surfaces (dev)' }} />
      <View style={styles.bar}>
        <Text style={[styles.title, themeName === 'web' && styles.titleDark]}>The money beat · {BPM} BPM · take {take.take + 1}</Text>
        <Toggle testID="play-dev-autoplay" label="Replay" value={autoplay ? 'on' : 'off'} onPress={() => setAutoplay(a => !a)} />
        <Toggle testID="play-dev-flow" label="Highway" value={flow === 'leftward' ? 'left ←' : 'falling ↓'} onPress={() => setFlow(f => (f === 'leftward' ? 'downward' : 'leftward'))} />
        <Toggle testID="play-dev-theme" label="Colours" value={themeName === 'ipad' ? 'iPad' : 'web'} onPress={() => setThemeName(t => (t === 'ipad' ? 'web' : 'ipad'))} />
        <Toggle testID="play-dev-restart" label="Take" value="restart" onPress={take.restart} />
      </View>
      <View style={[styles.card, styles.highway, { backgroundColor: theme.background }]}>
        <NoteHighway
          key={flow}
          testID="play-dev-highway"
          chart={chart}
          bpm={BPM}
          zero={take.zero}
          now={now}
          clock={clock}
          latencyMs={0}
          results={take.results.subscribe}
          options={options}
          theme={theme}
        />
      </View>
      <View style={styles.row}>
        <View style={[styles.card, styles.pads, { backgroundColor: theme.background }]}>
          <TouchPads testID="play-dev-pads" emitPad={take.emitPad} playNow={playNow} now={now} activeDrums={ACTIVE} results={take.results.subscribe} theme={theme} />
        </View>
        <View style={styles.side}>
          <View style={[styles.card, styles.kit, { backgroundColor: theme.background }]}>
            <KitView testID="play-dev-kit" hits={take.hits.subscribe} results={take.results.subscribe} activeDrums={ACTIVE} theme={theme} />
          </View>
          <Text style={styles.note}>
            Touch sounds: {sounds} (silent until the AudioPort lands). Check on the iPad: notes glide without stutter at
            60/120 Hz, two fingers land together, pads flash at once.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 16, gap: 12 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 19, fontWeight: '700', color: '#1C1C1E' },
  titleDark: { color: '#FFFFFF' },
  toggle: { minHeight: 44, minWidth: 96, paddingHorizontal: 14, borderRadius: 12, backgroundColor: 'rgba(120,120,128,0.16)', justifyContent: 'center' },
  toggleLabel: { fontSize: 12, color: 'rgba(60,60,67,0.7)', fontWeight: '600' },
  toggleValue: { fontSize: 16, color: '#007AFF', fontWeight: '600' },
  pressed: { opacity: 0.6 },
  card: { borderRadius: 22, overflow: 'hidden' },
  highway: { height: 300 },
  row: { flex: 1, flexDirection: 'row', gap: 12 },
  pads: { flex: 1 },
  side: { width: 340, gap: 10 },
  kit: { height: 170, padding: 8 },
  note: { fontSize: 13, color: 'rgba(60,60,67,0.7)' },
});
