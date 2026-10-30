// The app's light theme. A placeholder until the iPad mockups (D4) set the real one.
import { DefaultTheme, type Theme } from 'expo-router';

export const colors = {
  background: '#F6F4EF',
  surface: '#FFFFFF',
  text: '#1B1F24',
  muted: '#5B636E',
  primary: '#1F3A5F',
  accent: '#D65C36',
  ok: '#2E7D4F',
  warn: '#A35A00',
  border: '#E2DED5',
} as const;

export const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};
