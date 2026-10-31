// Layout harness (scripts/screenshots.mjs, web only): fake students for each screen state, picked by `?h=<state>`.
// Fake data only (no real takes, no names). The states mirror the Journey model tests (features/journey/model.test.ts).
import { CURRICULUM, LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import { startProgress, type LessonProgress } from '@drum-coach/core/engine/lesson';
import { isoWeek, type RunRow } from '@drum-coach/core/engine/progress';
import { DEFAULTS, type Settings } from '@drum-coach/core/input/settings';
import type { YtSong } from '@drum-coach/core/youtube/schemas';
import { currentSession } from '../../features/journey/model';

export type HarnessState = 'fresh' | 'recap' | 'sore' | 'week' | 'alldone' | 'writing' | 'busy';
export type Seed = {
  settings: Settings; runs: RunRow[]; ai: unknown[]; plan?: Record<string, unknown>; coachHangs?: boolean;
  /** Saved YouTube songs and the settings table's rows (teacherNotes, monthReport), for Progress and the teacher page. */
  songs?: YtSong[]; rows?: Record<string, unknown>;
};

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

/**
 * A long-time student, for Progress with everything in it: two months of takes on many lessons and exercises (long
 * titles), two songs ready for the show-off set, kept fills, the teacher's notes, a month report; some skills due.
 */
function busy(): Seed {
  const t = threeWeeksIn(['rushing', 'dragging']);
  const lessons: Record<string, LessonProgress> = { ...t.settings.lessons };
  const ids = CURRICULUM.filter(l => l.kind !== 'song').slice(0, 24).map(l => l.id);
  ids.forEach((id, i) => {
    const old = new Date(Date.now() - (40 + i) * 86_400_000);
    lessons[id] = i % 5 === 4 ? { ...startProgress(LESSON_BY_ID[id]), step: 1, bpm: 64 }
      : { ...finished(id, 1 + (i % 3)), bestBpm: LESSON_BY_ID[id].steps[LESSON_BY_ID[id].steps.length - 1].bpm.target, completedAt: day(old), reviewDue: i % 4 === 0 ? day(new Date(Date.now() - 2 * 86_400_000)) : undefined };
  });
  const runs: RunRow[] = [];
  for (let d = 60; d >= 0; d--) {
    if (d % 7 === 3) continue; // a rest day a week
    const at = new Date(); at.setDate(at.getDate() - d); at.setHours(18, 0, 0, 0);
    const id = ids[d % ids.length], l = LESSON_BY_ID[id];
    runs.push({ id: 1000 - d, chartId: `lesson/${id}/1`, chartTitle: `${l.title} · ${l.steps[0].title}`, startedAt: at.toISOString(), durationS: 900 + (d % 4) * 300,
      bpm: 60 + (d % 30), speed: 1, accuracy: 70 + (d % 25), meanOffset: 8, spread: 18, notes: 120 });
    if (d % 3 === 0) runs.push({ chartId: d % 2 ? 'singles' : 'paradiddle-16ths-around-the-kit-long-title', chartTitle: d % 2 ? 'Single strokes (16ths)' : 'Paradiddles around the kit with accents on the toms (16ths)',
      startedAt: new Date(at.getTime() + 3_600_000).toISOString(), durationS: 300, bpm: 80, speed: 1, accuracy: 88, meanOffset: 4, spread: 12, notes: 64 });
  }
  const notes = Array.from({ length: 20 * 8 }, (_, i) => ({ t: i / 2, drum: (i % 4 === 2 ? 'snare' : i % 4 === 0 ? 'kick' : 'hihat') as 'snare' | 'kick' | 'hihat' }));
  const song = (id: string, title: string): YtSong => ({ id, title, originalId: id.slice(3), drumlessId: null, coverId: null, timeSignature: [4, 4], notes, grids: {}, verifiedAt: day(new Date()) });
  const songs = [song('yt-aaaaaaaaaaa', 'Seven Nation Army (Official Music Video)'), song('yt-bbbbbbbbbbb', 'Billie Jean (Official Video)')];
  for (const s of songs) runs.push({ chartId: s.id, chartTitle: s.title, startedAt: new Date().toISOString(), durationS: 240, bpm: 100, speed: 1, accuracy: 92, meanOffset: 3, spread: 10, notes: 160, fromBar: 1, toBar: 20 });
  runs.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const fills = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, at: new Date(Date.now() - i * 3 * 86_400_000).toISOString(), bpm: 80 + i * 5, notes: notes.slice(0, 6 + i) }));
  const wk = isoWeek(today());
  return {
    settings: { ...t.settings, lessons, fills, badges: ['first-3star', 'notes-1k', 'streak-7', 'showoff'], lastRecapWeek: wk, soreAskedWeek: wk, hearingTipWeek: wk, leftHanded: true,
      profile: { goals: ['rock', 'funk'], minutesPerDay: 30, onboarded: true } },
    runs, ai: [], songs,
    rows: { teacherNotes: [{ date: day(new Date(Date.now() - 20 * 86_400_000)), text: 'Left wrist is stiff: slow singles with the left hand only.' }, { date: day(new Date()), text: 'Heel down on the kick for soft notes.' }] },
  };
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
    case 'busy': return busy();
    default: return { settings: base(), runs: [], ai: [] }; // fresh: day one, the setup nudge
  }
}

/** The state named in the page's URL (`?h=alldone`), else fresh. */
export function harnessState(): string {
  try { return new URLSearchParams(globalThis.location?.search ?? '').get('h') ?? 'fresh'; } catch { return 'fresh'; }
}
