import type { LessonProgress, Profile } from '../engine/lesson';
import type { SessionItem } from '../engine/planner';
import type { Chattiness } from '../engine/liveCoach';

// App settings that aren't per-kit, plus the student's lesson state.
// Synced to the server (SQLite) when it's up; localStorage keeps it working offline.
const KEY = 'drumcoach.settings';
export type Session = { date: string; items: SessionItem[]; done: number[] }; // frozen when the day's session starts
export type Settings = {
  latencyMs: number; browserSounds: boolean;
  profile: Profile; lessons: Record<string, LessonProgress>; session?: Session;
  updatedAt?: number; // ms; the newer copy wins when browser and server disagree
  liveTips: 'off' | 'screen' | 'voice'; chattiness: Chattiness;
  voice: boolean; countIn: boolean; // speak verdicts and coach feedback; spoken count-in
  playView: 'sheet' | 'highway';     // how notes are shown while playing
  aiTips: boolean;                    // the coach writes the live tip wording per exercise (one Claude call each)
  liveCoach: boolean; handsFree: boolean; // the live coaching conversation; listen for answers without holding V
  v?: number; // settings version, for one-time migrations
};
const DEFAULTS: Settings = {
  latencyMs: 0, browserSounds: false, liveTips: 'screen', chattiness: 'normal', voice: true, countIn: true, playView: 'sheet', aiTips: true, liveCoach: true, handsFree: false, v: 3,
  profile: { goals: [], minutesPerDay: 25, onboarded: false }, lessons: {},
};

let settings: Settings = { ...DEFAULTS };
try { settings = migrate({ ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }); } catch { /* defaults */ }

/** v2: the coach talks by default, so settings saved before that get the voice switched on once. */
/** v3: the coach stays quiet while you practise: tips on screen only, no listening after every reply. */
export function migrate(s: Settings): Settings {
  if ((s.v ?? 1) < 2) s = { ...s, voice: true, liveTips: s.liveTips === 'off' ? 'off' : 'voice', v: 2 };
  return s.v! < 3 ? { ...s, liveTips: s.liveTips === 'voice' ? 'screen' : s.liveTips, handsFree: false, v: 3 } : s;
}
const listeners = new Set<() => void>();

export const getSettings = () => settings;

/** Start-up merge: the server copy only replaces the browser copy if it's at least as new (progress made offline survives). */
export const serverIsNewer = (local: Partial<Settings>, server?: Partial<Settings>) =>
  !!server && (server.updatedAt ?? 0) >= (local.updatedAt ?? 0);
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
