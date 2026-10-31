// Layout harness (scripts/screenshots.mjs, web only): fake students for each screen state, picked by `?h=<state>`.
// Fake data only (no real takes, no names). The states mirror the Journey model tests (features/journey/model.test.ts).
import { CURRICULUM, LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import { startProgress, type LessonProgress } from '@drum-coach/core/engine/lesson';
import { isoWeek, type RunRow } from '@drum-coach/core/engine/progress';
import { DEFAULTS, type Settings } from '@drum-coach/core/input/settings';
import { currentSession } from '../../features/journey/model';

export type HarnessState = 'fresh' | 'recap' | 'sore' | 'week' | 'alldone' | 'writing';
export type Seed = { settings: Settings; runs: RunRow[]; ai: unknown[]; plan?: Record<string, unknown>; coachHangs?: boolean };

const today = () => new Date();
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const finished = (id: string, stars = 3): LessonProgress => ({ ...startProgress(LESSON_BY_ID[id]), completedAt: day(new Date(Date.now() - 10 * 86_400_000)), stars, reviewStage: 0 });
const base = (): Settings => ({ ...DEFAULTS, profile: { goals: [], minutesPerDay: 25, onboarded: true }, lessons: {} });

/** The mockups' student: three weeks in, Stage 3 "The money beat", step 3 at 70 BPM, takes on the last 10 days. */
function threeWeeksIn(tips?: string[]): { settings: Settings; runs: RunRow[] } {
  const lessons: Record<string, LessonProgress> = {};
  for (const id of ['posture', 'first-jam', 'count-quarters', 'count-8ths', 'rests', 'singles', 'hh-8ths', 'hands-feet', 'money-quarters']) lessons[id] = finished(id);
  lessons['ear-kick'] = finished('ear-kick', 2);
  lessons['doubles'] = finished('doubles', 2);
  lessons['money-8ths'] = { ...startProgress(LESSON_BY_ID['money-8ths']), step: 2, bpm: 70 };
  const runs: RunRow[] = [];
  for (let d = 9; d >= 0; d--) {
    const at = new Date(); at.setDate(at.getDate() - d); at.setHours(18, 0, 0, 0);
    runs.push({ chartId: 'lesson/money-8ths/2', chartTitle: 'The money beat · + kick', startedAt: at.toISOString(), durationS: 600, bpm: 70, speed: 1, accuracy: 82, meanOffset: 10, spread: 20, notes: 48, ...(tips && { tips }) });
  }
  return { settings: { ...base(), lessons, setupDone: true, badges: ['first-3star', 'notes-1k'] }, runs };
}

export function seedFor(state: string): Seed {
  const wk = isoWeek(today());
  switch (state as HarnessState) {
    case 'recap': { const t = threeWeeksIn(); return { ...t, ai: [] }; }
    case 'sore': { const t = threeWeeksIn(); return { settings: { ...t.settings, lastRecapWeek: wk, hearingTipWeek: wk }, runs: t.runs, ai: [] }; }
    case 'week': {
      const t = threeWeeksIn(['rushing']);
      return { settings: { ...t.settings, lastRecapWeek: wk, soreAskedWeek: wk, hearingTipWeek: wk }, runs: t.runs, ai: [] };
    }
    case 'writing': {
      const t = threeWeeksIn();
      return { settings: { ...t.settings, lastRecapWeek: wk, soreAskedWeek: wk, hearingTipWeek: wk }, runs: t.runs, ai: [], coachHangs: true };
    }
    case 'alldone': {
      const lessons: Record<string, LessonProgress> = {};
      for (const l of CURRICULUM) lessons[l.id] = finished(l.id);
      const s = { ...base(), lessons, setupDone: true, lastRecapWeek: wk, soreAskedWeek: wk, hearingTipWeek: wk, newStagesSeen: true, badges: ['first-3star', 'notes-1k', 'stage-3star'] };
      const set = currentSession(s, CURRICULUM, day(today()));
      return { settings: { ...s, session: { ...set, done: set.items.map((_, i) => i) } }, runs: threeWeeksIn().runs, ai: [] };
    }
    default: return { settings: base(), runs: [], ai: [] }; // fresh: day one, the setup nudge
  }
}

/** The state named in the page's URL (`?h=alldone`), else fresh. */
export function harnessState(): string {
  try { return new URLSearchParams(globalThis.location?.search ?? '').get('h') ?? 'fresh'; } catch { return 'fresh'; }
}
