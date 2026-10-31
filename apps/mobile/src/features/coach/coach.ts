// The app's one coach: the models (session, one-off questions, tips cache, week plan, saved drills) bound to the home
// server, the iPad's storage, the settings, the system voice and the router, plus the hooks screens read them with.
//
// For other screens (the lesson player, Practice):
//   getCoach().session.coachOpen(chart, bpm)          when an exercise or step opens ("this" in a question)
//   getCoach().session.coachTake(result, { chartId, lesson })   after each finished take (once per take)
//   getCoach().session.onCoachAction(handler)        how this screen carries out again / slower / faster / next …
//   getCoach().tips.load(chart); liveTips.wording = getCoach().tips.wordingFor(chart)   the coach's tip wording
//   setCoachPlaying(true / false)                      around a take (the coach never talks over one)
//   <CoachPanel take={result} …/> or <CoachInspector …/> (CoachPanel.tsx)
import { router } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { getHomeServer } from '../../platform/api';
import { getStorage } from '../../platform/storage';
import { readSettings } from '../../ui';
import { saveCoachLesson } from '../lesson/coachLesson';
import { lessonHref } from '../lesson/route';
import { hasApiKey, readApiKey, readCoachModel } from '../setup/coachServer';
import { keychain } from '../setup/useSetup';
import { createCoachAsks, type Entry } from './asks';
import { createCoachCharts, targetExists } from './charts';
import { createContextFor } from './context';
import { createSpeakOnce } from './feedback';
import { createCoachSession } from './session';
import { createTipsCache } from './tips';
import { applyVoiceFirst, hush, setVoicePlaying, speakMoment } from './voice';
import { createAnthropicClient } from './direct/anthropic';
import { createDirectCoach } from './direct/direct';
import { withDirectFallback } from './direct/fallback';
import { createWeekPlan } from './weekPlan';

/**
 * The lesson player's route for one chart (a drill, a plan item): `/lesson/chart?chartId=…&bpm=…`. The chart is in
 * the library (core LIBRARY) or saved in the charts table (findStoredChart).
 */
export const drillRoute = (t: { chartId: string; bpm?: number }) =>
  `/lesson/chart?chartId=${encodeURIComponent(t.chartId)}${t.bpm ? `&bpm=${Math.round(t.bpm)}` : ''}`;
/** A YouTube song (Songs, A8). */
export const songRoute = (id: string) => `/song/${encodeURIComponent(id)}`;

let playing = false;
/** The lesson player says when a take runs: the coach then never speaks, and a question means what's playing. */
export function setCoachPlaying(on: boolean, what?: { exercise?: string; bpm?: number; lesson?: string }) {
  playing = on;
  nowPlaying = on ? what : undefined;
  setVoicePlaying(on); // only the short live tips are said during a take
  if (on) hush();
}
let nowPlaying: { exercise?: string; bpm?: number; lesson?: string } | undefined;

function build() {
  applyVoiceFirst(); // D10: spoken live tips by default, once per install
  const storage = getStorage();
  const kv = storage.kv;
  // D2: the home server first; with a key in the Keychain, the iPad asks the Anthropic API when the server is away.
  const model = () => readCoachModel(kv);
  const direct = createDirectCoach({ kv, model, client: createAnthropicClient({ fetch: (url, init) => fetch(url, init), key: () => readApiKey(keychain), model }) });
  const server = withDirectFallback(getHomeServer(), direct, () => hasApiKey(keychain));
  const settings = () => readSettings(kv);
  const charts = createCoachCharts(storage);
  let aiLessonIds = new Set<string>();
  const refreshLessons = () => { void storage.aiLessons?.list().then(ls => { aiLessonIds = new Set(ls.map(l => l.id)); }).catch(() => {}); };
  refreshLessons();
  const exists = (chartId: string) => targetExists(chartId, { coachCharts: charts, aiLessonIds });
  const contextFor = createContextFor(storage);
  const voiceOn = () => settings().voice; // the volume is read by voice.ts as each sentence is said

  // Setup → Coach · fallback API key, read from the Keychain (async) when a call fails, so it's never stale.
  const hasFallbackKey = () => hasApiKey(keychain);
  const asks = createCoachAsks({ server, context: contextFor, hasFallbackKey });
  const session = createCoachSession({
    server, context: () => contextFor('session'), settings, hasFallbackKey, isPlaying: () => playing, playing: () => nowPlaying,
    sayNext: text => speakMoment({ kind: 'reply', text }), // gated by the voice setting and the take
    saveChart: chart => charts.save(chart), exists,
    nav: { openLesson: id => router.push(lessonHref(id)), openDrill: t => router.push(drillRoute(t)) },
  });
  const tips = createTipsCache({ kv, asks, settings });
  const weekPlan = createWeekPlan({ plans: storage.plans, asks });
  void weekPlan.refresh();
  const speakOnce = createSpeakOnce(text => speakMoment({ kind: 'reply', text }), voiceOn);
  /**
   * Asks the coach to write the next lesson for this stage (optionally about a failed take): the web's
   * requestCoachLesson. Once per key; saved with the server's `replaces`; `onSaved` reloads whoever lists lessons.
   */
  const requestLesson = (key: string, struggle?: Record<string, unknown>, onSaved?: () => void) => {
    void asks.ask(key, 'lesson', { struggle }, (l: unknown, meta) => {
      if (saveCoachLesson(storage.aiLessons, l, meta, id => !!settings().lessons[id])) { refreshLessons(); onSaved?.(); }
    });
  };
  return { server, asks, session, tips, weekPlan, charts, exists, speakOnce, refreshLessons, requestLesson };
}

type Coach = ReturnType<typeof build>;
const g = globalThis as { __drumCoach?: Coach };
export function getCoach(): Coach {
  g.__drumCoach ??= build();
  return g.__drumCoach;
}

/** The live session's state; re-renders on every change. */
export function useCoachSession() {
  const { session } = getCoach();
  return useSyncExternalStore(session.subscribe, session.get);
}

/** One question's entry (null key: none). */
export function useCoachEntry<T>(key: string | null): Entry<T> | undefined {
  const { asks } = getCoach();
  useSyncExternalStore(asks.subscribe, asks.version);
  return asks.entry<T>(key);
}

/** The stored week plan. */
export function useWeekPlan() {
  const { weekPlan } = getCoach();
  return useSyncExternalStore(weekPlan.subscribe, weekPlan.get);
}
