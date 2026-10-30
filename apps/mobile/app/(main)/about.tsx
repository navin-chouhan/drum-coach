// Build info (A2's first home screen, moved here when Journey became the home): proves the build, the core link and
// the platform pieces. Reached from the sidebar's Dev row in debug builds. Keeps A2's testIDs.
import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { coreLink } from '../../src/coreLink';
import { checkCapabilities, getCapabilities } from '../../src/platform/capabilities';
import { Body, Card, Label, Screen, TitleBar, color } from '../../src/ui';

function reactNativeVersion(): string {
  const v = Platform.constants.reactNativeVersion;
  return `${v.major}.${v.minor}.${v.patch}${v.prerelease ? `-${v.prerelease}` : ''}`;
}

function Row({ label, value, testID, tone }: { label: string; value: string; testID?: string; tone?: 'ok' | 'warn' }) {
  return (
    <View style={styles.row}>
      <Body style={styles.label} color={color.muted}>{label}</Body>
      <Body testID={testID} weight="700" color={tone === 'ok' ? color.good : tone === 'warn' ? color.ok : color.ink} style={styles.value}>{value}</Body>
    </View>
  );
}

export default function About() {
  const core = useMemo(coreLink, []);
  const [caps, setCaps] = useState(getCapabilities);
  useEffect(() => {
    let live = true;
    void checkCapabilities().then(c => { if (live) setCaps(c); });
    return () => { live = false; };
  }, []);
  const config = Constants.expoConfig;
  return (
    <Screen testID="screen-about">
      <TitleBar title="Build info" />
      <Card style={styles.card} testID="home-build-info">
        <Label>Build</Label>
        <Row label="App" value={`${config?.version ?? '?'} (${__DEV__ ? 'debug' : 'release'})`} />
        <Row label="Expo SDK" value={config?.sdkVersion ?? '?'} />
        <Row label="React Native" value={reactNativeVersion()} />
        <Row label="Device" value={`${Platform.OS} ${String(Platform.Version)}${Platform.OS === 'ios' && Platform.isPad ? ' (iPad)' : ''}`} />
        <Row label="Core" testID="home-core-status" tone={core.ok ? 'ok' : 'warn'}
          value={core.ok ? `reachable: snare = note ${core.snareNote}` : `not linked yet (${core.reason})`} />
        <Row label="MIDI module" testID="home-midi-status" tone={caps.midi ? 'ok' : 'warn'} value={caps.midi ? 'in this build' : 'not in this build'} />
        <Row label="Coach server" testID="home-coach-status" tone={caps.coachServer === 'reachable' ? 'ok' : 'warn'} value={caps.coachServer} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, maxWidth: 680 },
  row: { flexDirection: 'row', gap: 16 },
  label: { width: 140 },
  value: { flex: 1, fontVariant: ['tabular-nums'] },
});
