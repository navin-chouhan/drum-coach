// Copied from src/input/settings.ts (the web store), for a later move to core or src/data: the app settings on the
// iPad's key-value store, under the web's key (KV_KEYS.settings). No server mirror (D3: the iPad is the source of
// truth). Shape, DEFAULTS and migrations are core's.
import type { KeyValueStore } from '@drum-coach/core/platform';
import { DEFAULTS, migrate, type Settings } from '@drum-coach/core/input/settings';

export const SETTINGS_KEY = 'drumcoach.settings';

export type SettingsStore = {
  get(): Settings;
  /** Merges a patch, stamps `updatedAt` (as the web does on a synced save) and notifies. */
  set(patch: Partial<Settings>): void;
  subscribe(fn: () => void): () => void;
};

export function createSettingsStore(kv: KeyValueStore, now: () => number = Date.now): SettingsStore {
  let settings: Settings = { ...DEFAULTS };
  try { settings = migrate({ ...DEFAULTS, ...JSON.parse(kv.get(SETTINGS_KEY) ?? '{}') as Partial<Settings> }); } catch { /* defaults */ }
  const listeners = new Set<() => void>();
  return {
    get: () => settings,
    set(patch) {
      settings = { ...settings, ...patch, updatedAt: now() };
      kv.set(SETTINGS_KEY, JSON.stringify(settings));
      listeners.forEach(l => l());
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
