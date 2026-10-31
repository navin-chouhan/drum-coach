import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { keepAwake, keepAwakeWhileForeground } from '../src/platform/keepAwake';
import { colors, navigationTheme } from '../src/theme';

export default function RootLayout() {
  // The screen stays on while Drum Coach is in the foreground (hands are on sticks, not on the iPad).
  useEffect(() => keepAwakeWhileForeground(keepAwake, 'app', AppState), []);

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
          <Stack.Screen name="welcome/index" options={{ headerShown: false, gestureEnabled: false }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
