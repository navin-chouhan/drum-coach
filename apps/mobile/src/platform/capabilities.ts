// Capabilities (contracts.ts) for this build and device. Screens hide or explain what is missing.
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { Capabilities } from './contracts';
import { buildCapabilities, probeCoachServer } from './capabilitiesCore';

/** True when this build contains A3's native DrumMidi module (iOS dev/release builds; never Expo Go, web or Android). */
export function hasMidiModule(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return requireOptionalNativeModule('DrumMidi') != null;
  } catch {
    return false;
  }
}

/** Synchronous facts; coachServer is 'unknown' or 'not-configured' until checkCapabilities probes it. */
export function getCapabilities(coachServerUrl: string | null = null): Capabilities {
  return buildCapabilities({ midiModulePresent: hasMidiModule(), coachServerUrl });
}

/** getCapabilities plus a probe of the coach server's /api/health (A5 adds where the URL is stored). */
export async function checkCapabilities(coachServerUrl: string | null = null): Promise<Capabilities> {
  const caps = getCapabilities(coachServerUrl);
  return { ...caps, coachServer: await probeCoachServer(coachServerUrl, (url, init) => fetch(url, init)) };
}
