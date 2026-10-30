// Placeholder home: proves the build, the core link and the platform pieces. Real screens wait for the mockups (D4).
import Constants from 'expo-constants';
import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { coreLink } from '../src/coreLink';
import { checkCapabilities, getCapabilities } from '../src/platform/capabilities';
import { colors } from '../src/theme';

// Debug screens. A route that isn't in this build yet (audio and play are still being built) opens +not-found.
const DEV_LINKS = [
  { href: '/dev/midi', title: 'MIDI debug', testID: 'home-dev-midi-link' },
  { href: '/dev/server', title: 'Home server', testID: 'home-dev-server-link' },
  { href: '/dev/audio', title: 'Audio debug', testID: 'home-dev-audio-link' },
  { href: '/dev/play', title: 'Play surfaces', testID: 'home-dev-play-link' },
] as const;

function reactNativeVersion(): string {
  const v = Platform.constants.reactNativeVersion;
  return `${v.major}.${v.minor}.${v.patch}${v.prerelease ? `-${v.prerelease}` : ''}`;
}

function Row({ label, value, testID, tone }: { label: string; value: string; testID?: string; tone?: 'ok' | 'warn' }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text testID={testID} style={[styles.value, tone === 'ok' && styles.ok, tone === 'warn' && styles.warn]}>
        {value}
      </Text>
    </View>
  );
}

export default function Home() {
  const core = useMemo(coreLink, []);
  const [caps, setCaps] = useState(getCapabilities);
  useEffect(() => {
    let live = true;
    void checkCapabilities().then(c => { if (live) setCaps(c); });
    return () => { live = false; };
  }, []);
  const config = Constants.expoConfig;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text testID="home-title" style={styles.title} accessibilityRole="header">
          Drum Coach
        </Text>
        <Text style={styles.subtitle}>iPad shell. Lessons, practice and progress arrive with the approved designs.</Text>

        <View style={styles.card} testID="home-build-info">
          <Text style={styles.cardTitle}>Build</Text>
          <Row label="App" value={`${config?.version ?? '?'} (${__DEV__ ? 'debug' : 'release'})`} />
          <Row label="Expo SDK" value={config?.sdkVersion ?? '?'} />
          <Row label="React Native" value={reactNativeVersion()} />
          <Row label="Device" value={`${Platform.OS} ${String(Platform.Version)}${Platform.OS === 'ios' && Platform.isPad ? ' (iPad)' : ''}`} />
          <Row
            label="Core"
            testID="home-core-status"
            tone={core.ok ? 'ok' : 'warn'}
            value={core.ok ? `reachable: snare = note ${core.snareNote}` : `not linked yet (${core.reason})`}
          />
          <Row label="MIDI module" testID="home-midi-status" tone={caps.midi ? 'ok' : 'warn'} value={caps.midi ? 'in this build' : 'not in this build'} />
          <Row label="Coach server" testID="home-coach-status" tone={caps.coachServer === 'reachable' ? 'ok' : 'warn'} value={caps.coachServer} />
        </View>

        <View style={styles.devLinks}>
          {DEV_LINKS.map(l => (
            <Link key={l.href} href={l.href} asChild>
              <Pressable testID={l.testID} accessibilityRole="link" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
                <Text style={styles.buttonText}>{l.title}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 32, gap: 20, maxWidth: 760, width: '100%', alignSelf: 'center' },
  title: { fontSize: 40, fontWeight: '700', color: colors.primary },
  subtitle: { fontSize: 17, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', gap: 16 },
  label: { width: 140, fontSize: 16, color: colors.muted },
  value: { flex: 1, fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  ok: { color: colors.ok },
  warn: { color: colors.warn },
  devLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  button: { alignSelf: 'flex-start', backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 22 },
  pressed: { opacity: 0.7 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});
