import { MILESTONES } from '../content/curriculum';
import { dayKey, startProgress, type Lesson, type LessonProgress } from '../engine/lesson';
import { buildSession } from '../engine/planner';
import { getSettings, setSettings, type Session } from '../input/settings';
import { allLessons } from './aiLessons';
import { thisWeeksPlan } from '../coach/weekPlan';

// Lesson state lives in the app settings (localStorage + SQLite). History of runs is separate and never reset here.
export const today = () => dayKey(new Date());
export const progressOf = (l: Lesson): LessonProgress => getSettings().lessons[l.id] ?? startProgress(l);
export const saveProgress = (id: string, p: LessonProgress) => setSettings({ lessons: { ...getSettings().lessons, [id]: p } });

/** Today's stored session, or a fresh proposal (not saved until started). */
export function currentSession(): Session {
  const s = getSettings();
  return s.session?.date === today() ? s.session : { date: today(), items: buildSession(MILESTONES, allLessons(), s.lessons, s.profile, today(), thisWeeksPlan()?.lessonIds), done: [] };
}
export const startSession = () => { const s = currentSession(); setSettings({ session: s }); return s; };
export function markDone(idx: number) {
  const s = currentSession();
  if (!s.done.includes(idx)) setSettings({ session: { ...s, done: [...s.done, idx] } });
}

// Resets
export function resetLesson(id: string) {
  const lessons = { ...getSettings().lessons };
  delete lessons[id];
  setSettings({ lessons });
}
export const rebuildToday = () => setSettings({ session: undefined });
export const resetAllLessons = () => setSettings({ lessons: {}, session: undefined, profile: { ...getSettings().profile, onboarded: false } });
