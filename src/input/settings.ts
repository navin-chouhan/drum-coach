// App settings that aren't per-kit. Synced to the server (SQLite) when it's up; localStorage keeps it working offline.
const KEY = 'drumcoach.settings';
export type Settings = { latencyMs: number; browserSounds: boolean; autoCoach: boolean };
const DEFAULTS: Settings = { latencyMs: 0, browserSounds: false, autoCoach: false };

let settings: Settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* defaults */ }
const listeners = new Set<() => void>();

export const getSettings = () => settings;
export function subscribeSettings(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function setSettings(patch: Partial<Settings>, sync = true) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  if (sync) void fetch('/api/settings/app', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) }).catch(() => {});
  listeners.forEach(l => l());
}
