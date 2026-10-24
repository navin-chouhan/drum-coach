import type { LessonProgress, Profile } from '../engine/lesson';
import type { SessionItem } from '../engine/planner';

// App settings that aren't per-kit, plus the student's lesson state.
// Synced to the server (SQLite) when it's up; localStorage keeps it working offline.
const KEY = 'drumcoach.settings';
export type Session = { date: string; items: SessionItem[]; done: number[] }; // frozen when the day's session starts
export type Settings = {
  latencyMs: number; browserSounds: boolean; autoCoach: boolean;
  profile: Profile; lessons: Record<string, LessonProgress>; session?: Session;
  updatedAt?: number; // ms; the newer copy wins when browser and server disagree
};
const DEFAULTS: Settings = {
  latencyMs: 0, browserSounds: false, autoCoach: false,
  profile: { goals: [], minutesPerDay: 25, onboarded: false }, lessons: {},
};

let settings: Settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { /* defaults */ }
const listeners = new Set<() => void>();

export const getSettings = () => settings;

/** Start-up merge: the server copy only replaces the browser copy if it's at least as new (progress made offline survives). */
export const serverIsNewer = (local: Partial<Settings>, server?: Partial<Settings>) =>
  !!server && (server.updatedAt ?? 0) >= (local.updatedAt ?? 0);
export function subscribeSettings(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function setSettings(patch: Partial<Settings>, sync = true) {
  settings = { ...settings, ...patch, ...(sync && { updatedAt: Date.now() }) };
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  if (sync) void fetch('/api/settings/app', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) }).catch(() => {});
  listeners.forEach(l => l());
}
