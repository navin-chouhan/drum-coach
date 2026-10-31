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
import { lessonHref } from '../lesson/route';
import { hasApiKey } from '../setup/coachServer';
import { keychain } from '../setup/useSetup';
import { createCoachAsks, type Entry } from './asks';
import { createCoachCharts, targetExists } from './charts';
import { createContextFor } from './context';
import { createSpeakOnce } from './feedback';
import { createCoachSession } from './session';
import { createTipsCache } from './tips';
import { hush, sayNext, sayNow, setVoiceVolume } from './voice';
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
  if (on) hush();
}
let nowPlaying: { exercise?: string; bpm?: number; lesson?: string } | undefined;

function build() {
  const server = getHomeServer();
  const storage = getStorage();
  const kv = storage.kv;
  const settings = () => readSettings(kv);
  const charts = createCoachCharts(storage);
  let aiLessonIds = new Set<string>();
  const refreshLessons = () => { void storage.aiLessons?.list().then(ls => { aiLessonIds = new Set(ls.map(l => l.id)); }).catch(() => {}); };
  refreshLessons();
  const exists = (chartId: string) => targetExists(chartId, { coachCharts: charts, aiLessonIds });
  const contextFor = createContextFor(storage);
  const voiceOn = () => { const s = settings(); setVoiceVolume(s.voiceVolume); return s.voice; };

  // Setup → Coach · fallback API key, read from the Keychain (async) when a call fails, so it's never stale.
  const hasFallbackKey = () => hasApiKey(keychain);
  const asks = createCoachAsks({ server, context: contextFor, hasFallbackKey });
  const session = createCoachSession({
    server, context: () => contextFor('session'), settings, hasFallbackKey, isPlaying: () => playing, playing: () => nowPlaying,
    sayNext: text => { if (voiceOn()) sayNext(text); },
    saveChart: chart => charts.save(chart), exists,
    nav: { openLesson: id => router.push(lessonHref(id) as never), openDrill: t => router.push(drillRoute(t) as never) },
  });
  const tips = createTipsCache({ kv, asks, settings });
  const weekPlan = createWeekPlan({ plans: storage.plans, asks });
  void weekPlan.refresh();
  const speakOnce = createSpeakOnce(text => { if (!playing) sayNow(text); }, voiceOn);
  return { server, asks, session, tips, weekPlan, charts, exists, speakOnce, refreshLessons };
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
