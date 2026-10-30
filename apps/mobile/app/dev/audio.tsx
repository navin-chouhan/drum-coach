// Audio debug (A4): engine, route, clock check, metronome, touch pads, words, timing probe, stats.
import { Stack } from 'expo-router';
import { AudioDebugScreen } from '../../src/dev/audio/AudioDebugScreen';

export default function AudioDebug() {
  return (
    <>
      <Stack.Screen options={{ title: 'Audio debug' }} />
      <AudioDebugScreen />
    </>
  );
}
