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
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.primary,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
