// The app settings as the lesson player reads and writes them: the UI kit's store (src/ui/appSettings.ts: the web's
// key, shape and migrations in the key-value store, one subscription for every screen), behind a small interface so
// the controller is testable. Reads are cached until the next write anywhere in the app.
import type { Settings } from '@drum-coach/core/input/settings';
import type { KeyValueStore } from '@drum-coach/core/platform';
import { readSettings, settingsVersion, subscribeSettings, writeSettings, SETTINGS_KEY } from '../../ui/appSettings';

export { SETTINGS_KEY };

export type SettingsStore = {
  get(): Settings;
  /** Merges a patch, stamps `updatedAt` and notifies every screen. */
  set(patch: Partial<Settings>): void;
  subscribe(fn: () => void): () => void;
};

export function createSettingsStore(kv: KeyValueStore, now: () => number = Date.now): SettingsStore {
  let cache: { v: number; s: Settings } | undefined;
  return {
    get() {
      const v = settingsVersion();
      if (!cache || cache.v !== v) cache = { v, s: readSettings(kv) };
      return cache.s;
    },
    set(patch) { const s = writeSettings(kv, patch, now()); cache = { v: settingsVersion(), s }; },
    subscribe: subscribeSettings,
  };
}
