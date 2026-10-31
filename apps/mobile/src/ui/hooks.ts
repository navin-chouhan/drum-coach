// The kit's hooks over the platform: the app's one hit bus (the kit's MIDI → note map → hits), kit gestures for a
// screen's moves, the app settings, and the sidebar's status.
import { createHitBus, type HitBus } from '@drum-coach/core/input/hits';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { checkCapabilities, getCapabilities } from '../platform/capabilities';
import { onAppKey, startKeyboard, type AppKey } from '../platform/keyboard';
import { connectMidiToHitBus, getMidiPort } from '../platform/midi';
import { getStorage } from '../platform/storage';
import { readNoteMap, readPadCal, subscribeKitStore } from '../features/pads/kitStore';
import { readSettings, settingsVersion, subscribeSettings } from './appSettings';
import { createKitCache } from './kitCache';
import { sayItAgain } from '../features/coach/voice';
import { createKitMoveRouter, type KitMoveHandlers } from './kitMoves';
import { kitDot, statusRows, type KitDot, type StatusRow } from './status';
import { parseSidebarPref, type SidebarPref } from './nav';
import { useLatest } from './useLatest';

/** The kit's name as the note map and pad calibration are keyed: the connected input's, else the MPS-150's iOS name. */
export function kitName(): string {
  const sel = getMidiPort().selection();
  return sel?.selectedName || sel?.connectedId && getMidiPort().listInputs().find(i => i.id === sel.connectedId)?.name || 'e-Drum';
}

type G = { __drumAppHitBus?: HitBus };
const g = globalThis as G;

/**
 * The app's one hit bus, on the MIDI port's clock, linked to the kit once. The note map and pad calibration come from
 * the key-value store (the in-app remap and the "hit each pad" screen write them there through kitStore), kept in
 * memory and read again after a save or an inputs change (QA m1: no storage reads or native calls per hit).
 */
export function getAppHitBus(): HitBus {
  if (g.__drumAppHitBus) return g.__drumAppHitBus;
  const port = getMidiPort();
  const kit = createKitCache({
    kitName,
    readNoteMap: k => readNoteMap(getStorage().kv, k),
    readPadCal: k => readPadCal(getStorage().kv, k),
    subscribeSaves: subscribeKitStore,
    subscribeInputs: fn => port.onInputsChanged(fn),
    nameMaxAgeMs: 2000,
    now: Date.now,
  });
  const bus = createHitBus({ now: () => port.clock.now(), getNoteMap: kit.noteMap, getPadCal: kit.padCal });
  connectMidiToHitBus(port, bus);
  g.__drumAppHitBus = bus;
  return bus;
}

/**
 * The hardware keyboard plays pads on the app's hit bus (CLAUDE.md keys), once per app; app/_layout.tsx mounts it.
 * Idempotent: screens may call it too.
 */
export function startAppKeyboard() {
  return startKeyboard(getAppHitBus());
}

/**
 * Esc or Enter from a hardware keyboard runs `handler` while this screen is focused (the newest screen first).
 * Return false from the handler to let an older listener have the key too.
 */
export function useAppKey(key: AppKey, handler: () => boolean | void, opts: { enabled?: boolean } = {}) {
  const focused = useIsFocused();
  const on = (opts.enabled ?? true) && focused;
  const latest = useLatest(handler);
  useEffect(() => {
    if (!on) return;
    startAppKeyboard();
    return onAppKey(k => (k === key ? latest.current() !== false : false));
  }, [on, key, latest]);
}

/** The app settings; re-renders when any screen saves them. */
export function useAppSettings() {
  const v = useSyncExternalStore(subscribeSettings, settingsVersion);
  return useMemo(() => readSettings(getStorage().kv), [v]); // eslint-disable-line react-hooks/exhaustive-deps -- v is the settings' version: re-read on each save
}

/**
 * Kit gestures run this screen's moves while it is focused and "kit gestures" is on in Setup (settings.padCommands).
 * Handlers may change every render; the latest ones run.
 */
export function useKitMoves(handlers: KitMoveHandlers, opts: { enabled?: boolean; playing?: boolean } = {}) {
  const focused = useIsFocused();
  const { padCommands } = useAppSettings();
  const on = (opts.enabled ?? true) && focused && padCommands !== false;
  // Voice first (D10): kick × 2 between takes says the coach's last line again, on every screen with kit moves.
  const moves = useLatest<KitMoveHandlers>({ again: sayItAgain, ...handlers });
  const playing = useLatest(!!opts.playing);
  useEffect(() => {
    if (!on) return;
    const router = createKitMoveRouter(); // the gesture in progress is this listener's
    return getAppHitBus().onHit(h => { router.set(moves.current); router.hit(h, playing.current); });
  }, [on, moves, playing]);
  // …and key G (R is a tom: a pad key)
  useAppKey('g', () => { sayItAgain(); return true; }, { enabled: (opts.enabled ?? true) && !opts.playing });
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

/** The sidebar's kit dot (D10), live. */
export function useKitDot(): KitDot {
  const port = getMidiPort();
  const [kit, setKit] = useState<string | null>(() => connectedKit());
  useEffect(() => port.onInputsChanged(() => setKit(connectedKit())), [port]);
  return kitDot({ midi: port.available, kit });
}

const SIDEBAR_KEY = 'drumcoach.sidebar';
let sidebarVersion = 0;
const sidebarListeners = new Set<() => void>();
/** The sidebar's remembered mode (« / » or `\`): 'auto' until the owner picks one, kept in the key-value store. */
export function useSidebarPref(): [SidebarPref, (p: SidebarPref) => void] {
  const v = useSyncExternalStore(fn => { sidebarListeners.add(fn); return () => { sidebarListeners.delete(fn); }; }, () => sidebarVersion);
  const pref = useMemo(() => parseSidebarPref(getStorage().kv.get(SIDEBAR_KEY)), [v]); // eslint-disable-line react-hooks/exhaustive-deps -- v is the sidebar pref's version: re-read on each save
  const set = (p: SidebarPref) => { getStorage().kv.set(SIDEBAR_KEY, p); sidebarVersion++; sidebarListeners.forEach(l => l()); };
  return [pref, set];
}

function connectedKit(): string | null {
  const port = getMidiPort();
  if (!port.available) return null;
  const id = port.selection()?.connectedId;
  const input = id ? port.listInputs().find(i => i.id === id && i.online) : undefined;
  return input ? input.name : null;
}
