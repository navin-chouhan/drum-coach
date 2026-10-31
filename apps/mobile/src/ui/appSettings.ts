// The app settings (the core's Settings: profile, lesson progress, today's set, latency, kit gestures …) in the
// key-value store under the web's key, so the shape and the migrations are the web's. Pure (takes the store), with a
// tiny subscription so screens re-render when any screen saves. Never throws: a bad or missing value reads as defaults.
import { DEFAULTS, migrate, type Settings } from '@drum-coach/core/input/settings';
import type { KeyValueStore } from '@drum-coach/core/platform';

export const SETTINGS_KEY = 'drumcoach.settings'; // = KV_KEYS.settings (src/data/kv.ts)

/** Saved settings over the defaults (nested profile too), migrated like the web's. */
export function readSettings(kv: Pick<KeyValueStore, 'get'>): Settings {
  let saved: Partial<Settings> = {};
  try {
    const parsed = JSON.parse(kv.get(SETTINGS_KEY) ?? '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
  } catch { /* defaults */ }
  return migrate({ ...DEFAULTS, ...saved, profile: { ...DEFAULTS.profile, ...saved.profile }, lessons: saved.lessons ?? {} });
}

const listeners = new Set<() => void>();
let version = 0;

/** Merges `patch` into the saved settings, stamps updatedAt and tells every subscriber. */
export function writeSettings(kv: KeyValueStore, patch: Partial<Settings>, now = Date.now()): Settings {
  const next = { ...readSettings(kv), ...patch, updatedAt: now };
  kv.set(SETTINGS_KEY, JSON.stringify(next));
  version++;
  listeners.forEach(l => l());
  return next;
}

/** For useSyncExternalStore: changes whenever writeSettings runs. */
export const settingsVersion = () => version;
export function subscribeSettings(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
