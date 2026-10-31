import { Stack, ThemeProvider, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { keepAwake, keepAwakeWhileForeground } from '../src/platform/keepAwake';
import { refocusKeyboard } from '../src/platform/keyboard';
import { colors, navigationTheme } from '../src/theme';
import { startAppKeyboard } from '../src/ui';

export default function RootLayout() {
  // The screen stays on while Drum Coach is in the foreground (hands are on sticks, not on the iPad).
  useEffect(() => keepAwakeWhileForeground(keepAwake, 'app', AppState), []);
  // A hardware keyboard plays pads app-wide (CLAUDE.md keys: Space kick, S snare, A/Q hi-hat, Z pedal, E/R/F toms,
  // W crash, T ride), once for the app; after each route change the keys are taken back from a closed modal or field.
  useEffect(() => { startAppKeyboard(); }, []);
  const path = usePathname();
  useEffect(() => { refocusKeyboard(); }, [path]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.primary,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(main)" options={{ headerShown: false }} />
          {/* Full-screen frames (QA M1): the lesson player, Practice's play screen and metronome, a song, first run. */}
          <Stack.Screen name="lesson" options={{ headerShown: false }} />
          <Stack.Screen name="practice/play" options={{ headerShown: false }} />
          <Stack.Screen name="practice/metronome" options={{ headerShown: false }} />
          <Stack.Screen name="song/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="technique/index" options={{ headerShown: false }} />
          <Stack.Screen name="flow/index" options={{ headerShown: false }} />
          <Stack.Screen name="welcome/index" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
