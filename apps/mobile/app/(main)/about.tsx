// Build info (A2's first home screen, moved here when Journey became the home): proves the build, the core link and
// the platform pieces. Reached from Setup › About (D10) and the sidebar's Dev row in debug builds. Keeps A2's testIDs.
import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { coreLink } from '../../src/coreLink';
import { checkCapabilities, getCapabilities } from '../../src/platform/capabilities';
import * as DrumYouTube from '../../modules/drum-youtube';
import { getStorage } from '../../src/platform/storage';
import { router } from 'expo-router';
import { Body, Button, Card, Label, Screen, TitleBar, Toggle, color } from '../../src/ui';
import { readDevNative, writeDevNative } from '../../src/youtube/playerChoice';

const DEV_SCREENS = [
  { label: 'MIDI', href: '/dev/midi' }, { label: 'Server', href: '/dev/server' }, { label: 'Audio', href: '/dev/audio' },
  { label: 'Play', href: '/dev/play' }, { label: 'Sheet', href: '/dev/sheet' },
] as const;

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
  const core = useMemo(() => coreLink(), []);
  const [caps, setCaps] = useState(getCapabilities);
  useEffect(() => {
    let live = true;
    void checkCapabilities().then(c => { if (live) setCaps(c); });
    return () => { live = false; };
  }, []);
  const config = Constants.expoConfig;
  const [nativeYt, setNativeYt] = useState(() => readDevNative(getStorage().kv));
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
        <Row label="YouTube module" testID="home-youtube-status" tone={DrumYouTube.available ? 'ok' : 'warn'} value={DrumYouTube.available ? 'in this build' : 'not in this build'} />
      </Card>
      <Card style={styles.card} testID="home-dev-toggles">
        <Label>Dev toggles</Label>
        <View style={styles.toggle}>
          <Body style={styles.value}>Native YouTube player (Release default). Songs opened afterwards use it; off: the DOM player.</Body>
          <Toggle label="Native YouTube player (Release default)" value={nativeYt} disabled={!DrumYouTube.available}
            onChange={v => setNativeYt(writeDevNative(getStorage().kv, v))} testID="home-dev-native-youtube" />
        </View>
      </Card>
      {__DEV__ ? (
        // D10: the dev links live here (Setup › About) as well as in the sidebar's dev row of debug builds.
        <Card style={styles.card} testID="about-dev-links">
          <Label>Dev screens</Label>
          <View style={styles.links}>
            {DEV_SCREENS.map(d => <Button key={d.href} size="small" label={d.label} onPress={() => router.push(d.href)} testID={`about-dev-${d.label.toLowerCase()}`} />)}
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, maxWidth: 680 },
  row: { flexDirection: 'row', gap: 16 },
  label: { width: 140 },
  value: { flex: 1, fontVariant: ['tabular-nums'] },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
