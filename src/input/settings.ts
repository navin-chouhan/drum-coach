import { DEFAULTS, migrate, type Settings } from '../../packages/core/src/input/settings.ts';

// The Settings shape, DEFAULTS, migrate and serverIsNewer live in @drum-coach/core (packages/core/src/input/settings.ts).
// This is the web store: synced to the server (SQLite) when it's up; localStorage keeps it working offline.
export * from '../../packages/core/src/input/settings.ts';
const KEY = 'drumcoach.settings';

let settings: Settings = { ...DEFAULTS };
try { settings = migrate({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }); } catch { /* defaults */ }

const listeners = new Set<() => void>();

export const getSettings = () => settings;

// Another tab saved: take its copy, or this tab's next save would write its stale copy over it (progress lost).
if (typeof window !== 'undefined') window.addEventListener('storage', e => {
  if (e.key !== KEY || !e.newValue) return;
  try { settings = migrate({ ...DEFAULTS, ...JSON.parse(e.newValue) }); listeners.forEach(l => l()); } catch { /* ignore */ }
});
export function subscribeSettings(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function setSettings(patch: Partial<Settings>, sync = true) {
  settings = { ...settings, ...patch, ...(sync && { updatedAt: Date.now() }) };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  if (sync) void fetch('/api/settings/app', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) }).catch(() => {});
  listeners.forEach(l => l());
}
