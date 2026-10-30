// Setup's and the first run's hooks over the platform: the kit connection (hot-plug), the last hit, the current kit's
// note map and pad calibration, the audio route and its latency, recent runs, and the Keychain for the API key.
// The logic is in the pure files next to this one; these only subscribe and re-render.
import type { Hit } from '@drum-coach/core/input/hits';
import type { RunRow } from '@drum-coach/core/engine/progress';
import type { AudioRoute } from '@drum-coach/core/play/audioPort';
import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { audio } from '../../platform/audio';
import type { MidiInputInfo } from '../../platform/contracts';
import { getMidiPort } from '../../platform/midi';
import { getStorage } from '../../platform/storage';
import { getAppHitBus, kitName, readSettings, writeSettings } from '../../ui';
import { readLatencyByRoute, syncToRoute } from '../latency/latencyByRoute';
import { kitStoreVersion, readNoteMap, readPadCal, subscribeKitStore } from '../pads/kitStore';
import type { SecretStore } from './coachServer';
import { MIDI_INPUT_KEY, connectedInput, savedInput } from './kit';

const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

/** The MIDI inputs, the connected one, and select (kept by name, as the web keeps drumcoach.midiInput). */
export function useKitConnection() {
  const port = getMidiPort();
  const read = useCallback(() => {
    const inputs = safe(() => port.listInputs(), [] as MidiInputInfo[]);
    return { inputs, connected: connectedInput(inputs, safe(() => port.selection()?.connectedId, undefined)) };
  }, [port]);
  const [state, setState] = useState(read);
  useEffect(() => {
    // A saved choice other than the default kit is restored once its input is online.
    const restore = () => {
      const saved = getStorage().kv.get(MIDI_INPUT_KEY);
      const want = savedInput(safe(() => port.listInputs(), []), saved);
      if (want && safe(() => port.selection()?.connectedId, undefined) !== want.id) safe(() => port.select(want.id), false);
    };
    restore();
    setState(read());
    return port.onInputsChanged(() => { restore(); setState(read()); });
  }, [port, read]);
  const select = useCallback((input: MidiInputInfo) => {
    getStorage().kv.set(MIDI_INPUT_KEY, input.name);
    safe(() => port.select(input.id), false);
    setState(read());
  }, [port, read]);
  return { midi: port.available, ...state, select };
}

/** The last hit from the app's hit bus (kit or touch). */
export function useLastHit(): Hit | undefined {
  const [hit, setHit] = useState<Hit>();
  useEffect(() => getAppHitBus().onHit(setHit), []);
  return hit;
}

/** The current kit's name, note map and pad calibration; re-renders when either is saved. */
export function useKitData() {
  const v = useSyncExternalStore(subscribeKitStore, kitStoreVersion);
  const { connected } = useKitConnection();
  return useMemo(() => {
    const kit = kitName();
    const kv = getStorage().kv;
    return { kit, map: readNoteMap(kv, kit), padCal: readPadCal(kv, kit) };
  }, [v, connected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The audio route (null until the engine has started once). */
export function useAudioRoute(): AudioRoute | null {
  const [route, setRoute] = useState<AudioRoute | null>(() => audio.route());
  useEffect(() => audio.onRouteChange(setRoute), []);
  return route;
}

/** Applies the current route's measured latency to settings.latencyMs on every route event (D6). */
export function syncLatencyToRoute(route: AudioRoute | null): void {
  const kv = getStorage().kv;
  const patch = syncToRoute(readLatencyByRoute(kv), route, readSettings(kv));
  if (patch) writeSettings(kv, patch);
}

export function useLatencyRouteSync(): void {
  useEffect(() => {
    syncLatencyToRoute(audio.route());
    return audio.onRouteChange(syncLatencyToRoute);
  }, []);
}

/** Recent runs, oldest first (for "your last takes lean late"). */
export function useRecentRuns(limit = 50): RunRow[] {
  const [runs, setRuns] = useState<RunRow[]>([]);
  useEffect(() => {
    let live = true;
    getStorage().runs.list({ limit }).then(r => { if (live) setRuns(r as RunRow[]); }, () => {});
    return () => { live = false; };
  }, [limit]);
  return runs;
}

const KEYCHAIN: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
/** The Keychain, as src/platform/api.ts uses it for the server token (this device only, while unlocked). */
export const keychain: SecretStore = {
  get: key => SecureStore.getItemAsync(key, KEYCHAIN).catch(() => null),
  set: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN),
  remove: key => SecureStore.deleteItemAsync(key, KEYCHAIN),
};
