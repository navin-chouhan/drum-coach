// Capabilities (contracts.ts) for this build and device. Screens hide or explain what is missing.
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { Capabilities } from './contracts';
import { getHomeServer, serverStatusOf } from './api';
import { buildCapabilities } from './capabilitiesCore';

/** True when this build contains A3's native DrumMidi module (iOS dev/release builds; never Expo Go, web or Android). */
export function hasMidiModule(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return requireOptionalNativeModule('DrumMidi') != null;
  } catch {
    return false;
  }
}

/**
 * Synchronous facts. coachServer is 'not-configured' without a saved home server, else 'unknown' until
 * checkCapabilities asks it. The URL defaults to the saved one (src/platform/api.ts).
 */
export function getCapabilities(coachServerUrl: string | null = getHomeServer().configured()?.url ?? null): Capabilities {
  return buildCapabilities({ midiModulePresent: hasMidiModule(), coachServerUrl });
}

/**
 * getCapabilities plus the home server's answer to GET /api/health, sent with the saved token (a home-server-mode
 * server answers 401 without it). Never throws.
 */
export async function checkCapabilities(): Promise<Capabilities> {
  const server = getHomeServer();
  const caps = getCapabilities(server.configured()?.url ?? null);
  return { ...caps, coachServer: serverStatusOf(await server.health()) };
}
