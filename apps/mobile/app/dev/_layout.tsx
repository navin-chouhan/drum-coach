// The dev screens (/dev/midi, /dev/audio, /dev/play, /dev/sheet, /dev/server, /dev/parts): debug builds only, as the
// sidebar's Dev row (QA4 m3). A Release build sends a deep link here to Journey. The web is the layout harness
// (scripts/screenshots.mjs), a production web export that needs /dev/parts; an iOS build is never 'web'.
// Their own stack, with headers as before (each screen sets its title or hides it).
import { Redirect, Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function DevLayout() {
  return __DEV__ || Platform.OS === 'web' ? <Stack /> : <Redirect href="/" />;
}
