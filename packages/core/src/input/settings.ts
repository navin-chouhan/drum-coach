import type { ChartNote } from '../engine/chart.ts';
import type { LessonProgress, Profile } from '../engine/lesson.ts';
import type { SessionItem } from '../engine/planner.ts';
import type { Chattiness } from '../engine/liveCoach.ts';

// App settings that aren't per-kit, plus the student's lesson state: the shape, the defaults and the migrations.
// Where they're kept is the app's job (web: localStorage mirrored to the server, src/input/settings.ts).
export type Session = { date: string; items: SessionItem[]; done: number[] }; // frozen when the day's session starts
export type Settings = {
  latencyMs: number; browserSounds: boolean;
  profile: Profile; lessons: Record<string, LessonProgress>; session?: Session;
  fills?: { id: string; at: string; bpm: number; timeSignature?: [number, 2 | 4 | 8 | 16]; notes: ChartNote[] }[]; // your fills from free bars (last 20)
  arcade?: Record<string, number>; // beat the clock: best clean bars in 2 minutes, per lesson
  autopilot?: boolean; // after a verdict, the next move starts by itself after 5 s unless you hit a pad
  lastRecapWeek?: string; // the ISO week the Monday recap was last given
  intro?: boolean; // intro slides before the first take of an exercise or step (default on)
  hints?: boolean; // the count and who plays each note under the sheet (default on)
  setupDone?: boolean; setupNudged?: boolean; // onboarding's kit step (pads + latency) done; Journey's one reminder given
  padsCheckedAt?: string; soundChecked?: boolean; // Setup → Your kit: when 'hit each pad once' was last saved (YYYY-MM-DD); the sound check from the throne finished
  realSong?: boolean; // N3: a lesson's song bite plays over the drumless YouTube upload (default on when there is one)
  band?: boolean; bandVolume?: number; // the backing band under grooves and songs (default on, 0.6)
  latencyChecked?: boolean;
  soreUntil?: string; soreAskedWeek?: string; hearingTipWeek?: string; // N10: lighter days until this date; weekly check-ins
  leftHanded?: boolean; // N9: hints, intro slides and "How it moves" mirror R and L
  newStagesSeen?: boolean; // the one-time "New stages open" line (levels 7–9) // a latency test was saved (lay-back lessons need it)
  badges?: string[]; // earned badge ids (engine/progress.ts BADGES), so a new one is announced once
  updatedAt?: number; // ms; the newer copy wins when browser and server disagree
  liveTips: 'off' | 'screen' | 'voice'; chattiness: Chattiness;
  voice: boolean; countIn: boolean; // speak verdicts and coach feedback; spoken count-in
  playView: 'sheet' | 'highway';     // how notes are shown while playing
  aiTips: boolean;                    // the coach writes the live tip wording per exercise (one Claude call each)
  liveCoach: boolean; handsFree: boolean; // the live coaching conversation; listen for answers without holding V
  padCommands: boolean;
  clickVolume: number; voiceVolume: number; // app sound levels (0.2–1.25), balanced against the kit in the sound check               // double hits between takes control the app (engine/padCommands.ts)
  v?: number; // settings version, for one-time migrations
};
export const DEFAULTS: Settings = {
  latencyMs: 0, browserSounds: false, liveTips: 'screen', chattiness: 'normal', voice: true, countIn: true, playView: 'sheet', aiTips: true, liveCoach: true, handsFree: false, padCommands: true, clickVolume: 1, voiceVolume: 1, v: 3,
  profile: { goals: [], minutesPerDay: 25, onboarded: false }, lessons: {},
};

/** v2: the coach talks by default, so settings saved before that get the voice switched on once. */
/** v3: the coach stays quiet while you practise: tips on screen only, no listening after every reply. */
export function migrate(s: Settings): Settings {
  if ((s.v ?? 1) < 2) s = { ...s, voice: true, liveTips: s.liveTips === 'off' ? 'off' : 'voice', v: 2 };
  return s.v! < 3 ? { ...s, liveTips: s.liveTips === 'voice' ? 'screen' : s.liveTips, handsFree: false, v: 3 } : s;
}

/** Start-up merge: the server copy only replaces the local copy if it's at least as new (progress made offline survives). */
export const serverIsNewer = (local: Partial<Settings>, server?: Partial<Settings>) =>
  !!server && (server.updatedAt ?? 0) >= (local.updatedAt ?? 0);
