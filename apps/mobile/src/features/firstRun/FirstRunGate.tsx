// Sends a fresh install to the first run (web: TodayView shows Onboarding while !profile.onboarded). Rendered once by
// the main layout (app/(main)/_layout.tsx): <FirstRunGate />.
import { Redirect } from 'expo-router';
import { useAppSettings } from '../../ui';
import { needsFirstRun } from './firstRun';

export function FirstRunGate() {
  const s = useAppSettings();
  return needsFirstRun(s) ? <Redirect href="/welcome" /> : null;
}
