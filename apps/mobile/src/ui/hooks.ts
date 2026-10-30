// The kit's hooks over the platform: the app's one hit bus (the kit's MIDI → note map → hits), kit gestures for a
// screen's moves, the app settings, and the sidebar's status.
import { DEFAULT_NOTE_MAP, type NoteMap } from '@drum-coach/core/engine/kit';
import type { KitCalibration } from '@drum-coach/core/engine/padCal';
import { createHitBus, type HitBus } from '@drum-coach/core/input/hits';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { checkCapabilities, getCapabilities } from '../platform/capabilities';
import { connectMidiToHitBus, getMidiPort } from '../platform/midi';
import { getStorage, KV_KEYS } from '../platform/storage';
import { readSettings, settingsVersion, subscribeSettings } from './appSettings';
import { createKitMoveRouter, type KitMoveHandlers } from './kitMoves';
import { statusRows, type StatusRow } from './status';

/** The kit's name as the note map and pad calibration are keyed: the connected input's, else the MPS-150's iOS name. */
export function kitName(): string {
  const sel = getMidiPort().selection();
  return sel?.selectedName || sel?.connectedId && getMidiPort().listInputs().find(i => i.id === sel.connectedId)?.name || 'e-Drum';
}

function readJson<T>(key: string): T | undefined {
  try { const t = getStorage().kv.get(key); return t ? JSON.parse(t) as T : undefined; } catch { return undefined; }
}

type G = { __drumAppHitBus?: HitBus };
const g = globalThis as G;

/**
 * The app's one hit bus, on the MIDI port's clock, linked to the kit once. The note map and pad calibration are read
 * per hit from the key-value store (the in-app remap and the "hit each pad" screen write them there).
 */
export function getAppHitBus(): HitBus {
  if (g.__drumAppHitBus) return g.__drumAppHitBus;
  const port = getMidiPort();
  const bus = createHitBus({
    now: () => port.clock.now(),
    getNoteMap: () => ({ ...DEFAULT_NOTE_MAP, ...readJson<Partial<NoteMap>>(KV_KEYS.noteMap(kitName())) }),
    getPadCal: () => readJson<KitCalibration>(KV_KEYS.padCal(kitName())) ?? {},
  });
  connectMidiToHitBus(port, bus);
  g.__drumAppHitBus = bus;
  return bus;
}

/** The app settings; re-renders when any screen saves them. */
export function useAppSettings() {
  const v = useSyncExternalStore(subscribeSettings, settingsVersion);
  return useMemo(() => readSettings(getStorage().kv), [v]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Kit gestures run this screen's moves while it is focused and "kit gestures" is on in Setup (settings.padCommands).
 * Handlers may change every render; the latest ones run.
 */
export function useKitMoves(handlers: KitMoveHandlers, opts: { enabled?: boolean; playing?: boolean } = {}) {
  const focused = useIsFocused();
  const { padCommands } = useAppSettings();
  const on = (opts.enabled ?? true) && focused && padCommands !== false;
  const router = useRef(createKitMoveRouter()).current;
  router.set(handlers);
  const playing = useRef(false);
  playing.current = !!opts.playing;
  useEffect(() => {
    if (!on) return;
    return getAppHitBus().onHit(h => { router.hit(h, playing.current); });
  }, [on, router]);
}

/** The sidebar's status pills: kit (live), latency (settings) and the coach server (checked now and every minute). */
export function useStatusRows(): StatusRow[] {
  const settings = useAppSettings();
  const port = getMidiPort();
  const [kit, setKit] = useState<string | null>(() => connectedKit());
  const [coach, setCoach] = useState(() => getCapabilities().coachServer);
  useEffect(() => port.onInputsChanged(() => setKit(connectedKit())), [port]);
  useEffect(() => {
    let live = true;
    const check = () => void checkCapabilities().then(c => { if (live) setCoach(c.coachServer); }).catch(() => {});
    check();
    const t = setInterval(check, 60_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  return statusRows({ midi: port.available, kit, latencyMs: settings.latencyChecked || settings.latencyMs ? settings.latencyMs : null, coach });
}

function connectedKit(): string | null {
  const port = getMidiPort();
  if (!port.available) return null;
  const id = port.selection()?.connectedId;
  const input = id ? port.listInputs().find(i => i.id === id && i.online) : undefined;
  return input ? input.name : null;
}
