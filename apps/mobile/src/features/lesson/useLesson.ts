// The lesson player's wiring to the iPad: core's take engine on the MIDI clock and the app's one hit bus, the
// AudioPort, Storage (settings, runs, coach lessons), the coach (A7e: session, tip wording, voice), today's set and
// interruptions (D6).
import { MILESTONES } from '@drum-coach/core/content/curriculum';
import type { PadId } from '@drum-coach/core/engine/kit';
import type { Lesson } from '@drum-coach/core/engine/lesson';
import { router } from 'expo-router';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { AppState } from 'react-native';
import { audio } from '../../platform/audio';
import { getMidiPort } from '../../platform/midi';
import { getStorage } from '../../platform/storage';
import { getAppHitBus } from '../../ui/hooks';
import { getCoach, setCoachPlaying } from '../coach';
import { sayNow } from '../coach/voice';
import { allLessons } from '../journey/source';
import { LessonController, type LessonDeps } from './controller';
import { findStoredChart } from '../songs/findChart';
import { drillLesson, findDrillChart } from './drill';
import { todayKey } from './progress';
import { findLesson, itemDonePatch, lessonHref, nextItem, setItemOf, type LessonParams } from './route';
import { createSettingsStore } from './settings';
import { createTakePort, type CoreTakePort } from './takePort';

// Celebration flourishes (src/lesson/Celebration.tsx FILL / BIG_FILL): pad, seconds after now.
const FILL: [PadId, number][] = [['snare', 0], ['snare', 0.12], ['tom1', 0.24], ['tom2', 0.36], ['floor', 0.48], ['kick', 0.6], ['crash', 0.6]];
const BIG_FILL: [PadId, number][] = [...FILL.slice(0, 5), ['snare', 0.6], ['snare', 0.66], ['snare', 0.72], ['snare', 0.78], ['kick', 0.9], ['crash', 0.9], ['kick', 1.2], ['crash', 1.2]];

/** Whether the e-Drum is connected right now (else the touch pads show). */
export function useKitConnected(): boolean {
  const port = getMidiPort();
  const read = () => {
    if (!port.available) return false;
    const id = port.selection()?.connectedId;
    return !!id && port.listInputs().some(i => i.id === id && i.online);
  };
  const [on, setOn] = useState(read);
  useEffect(() => port.onInputsChanged(() => setOn(read())), [port]); // eslint-disable-line react-hooks/exhaustive-deps
  return on;
}

export type LessonHandle = { ctl: LessonController; take: CoreTakePort; lesson: Lesson; version: number };

/** `drill`: the /lesson/chart route's chart id and tempo. */
export function useLesson(params: LessonParams, drill?: { chartId: string; bpm?: number }): LessonHandle | { missing: true } | null {
  const storage = getStorage();
  const settings = useMemo(() => createSettingsStore(storage.kv), [storage]);
  const coach = getCoach();
  const [ai, setAi] = useState<unknown[] | null>(null);
  useEffect(() => { let live = true; void (storage.aiLessons?.list() ?? Promise.resolve([])).then(l => { if (live) setAi(l); }, () => { if (live) setAi([]); }); return () => { live = false; }; }, [storage]);
  const lessons = useMemo(() => allLessons(ai ?? []), [ai]);
  // library, imported (the charts table) or coach-written (QA m8: one lookup)
  const drillChart = drill ? findDrillChart(drill.chartId, id => findStoredChart(id, storage)) : undefined;
  const lesson = drill ? (drillChart ? drillLesson(drillChart, drill.bpm) : undefined) : findLesson(lessons, params.id);
  const [version, bump] = useReducer((n: number) => n + 1, 0);

  const take = useMemo(() => createTakePort({
    clock: getMidiPort().clock, audio, onHit: getAppHitBus().onHit,
    settings: () => { const s = settings.get(); return { latencyMs: s.latencyMs, liveTips: s.liveTips, chattiness: s.chattiness, countIn: s.countIn }; },
    wording: (chart, cue) => coach.tips.wordingFor(chart)(cue),
    onCue: c => { if (settings.get().liveTips === 'voice') sayNow(c.spoken); },
  }), [settings, coach]);

  // The take's clock loop: plans sounds, gives live tips, ends the take (~20×/s).
  useEffect(() => { const t = setInterval(() => take.tick(), 50); return () => clearInterval(t); }, [take]);

  const ctl = useMemo(() => {
    if (!lesson) return null;
    const today = todayKey();
    const it = drill ? undefined : setItemOf(settings.get(), params.item, lesson.id, today);
    const exists = (id: string) => !!findLesson(lessons, id);
    const next = drill ? undefined : nextItem(settings.get().session, params.item, today, exists);
    const deps: LessonDeps = {
      setup: { lesson, role: it?.role, minutes: it?.minutes, hasNext: !!next, flow: params.mode === 'flow', arcade: params.mode === 'arcade', drill: !!drill },
      take, settings, lessons: () => lessons, lessonById: id => findLesson(lessons, id), milestones: MILESTONES, today: todayKey,
      saveRun: run => storage.runs.add(run), coach: coach.session,
      say: text => sayNow(text.replace(/[🏆✓★]/gu, '').trim()),
      flourish: big => {
        if (!audio.available) return;
        const at = audio.clock.now() + (audio.route()?.minLeadMs ?? 100) + 50;
        audio.schedule((big ? BIG_FILL : FILL).map(([pad, dt]) => ({ kind: 'sound' as const, at: at + dt * 1000, sound: `drum.${pad}` as const, gain: 110 / 127 })));
      },
      requestCoachLesson: (key, struggle) => coach.requestLesson(key, struggle),
      drillExists: id => coach.exists(id),
      openDrill: a => coach.session.runAction(a),
      onBack: () => { if (router.canGoBack()) router.back(); else router.replace('/' as never); },
      onNext: next ? () => router.replace(lessonHref(next.lessonId, next.index) as never) : undefined,
      onItemDone: () => { const p = itemDonePatch(settings.get(), params.item, todayKey()); if (p.session) settings.set(p); },
      openLatency: () => router.navigate('/setup' as never),
    };
    return new LessonController(deps);
    // one controller per lesson and item; the lesson list only fills in coach lessons
  }, [lesson?.id, params.item, params.mode, take]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ctl || !lesson) return;
    const off = ctl.subscribe(bump);
    // The coach's tip wording for this step, written ahead of time (never in the real-time path).
    const f = ctl.frame();
    void coach.tips.load(f.step.chart, f.step.text);
    if (params.mode === 'hear') ctl.play(true);
    // D6: a call, Siri, an alarm or the app going to the background ends the take at its last whole bar.
    const offAudio = audio.onInterruption(e => { if (e.type === 'began' || e.type === 'engine-stopped') ctl.interrupt(); });
    const offApp = AppState.addEventListener('change', s => { if (s !== 'active') ctl.interrupt(); });
    return () => { off(); offAudio(); offApp.remove(); ctl.dispose(); setCoachPlaying(false); };
  }, [ctl]); // eslint-disable-line react-hooks/exhaustive-deps

  // The coach never talks over a take, and a question mid-take means what's playing.
  const playing = !!ctl?.playing;
  useEffect(() => {
    if (!ctl || !lesson) return;
    const s = take.state;
    setCoachPlaying(playing, playing ? { exercise: s.chart?.title, bpm: s.chart && s.options ? Math.round(s.chart.bpm * s.options.speed) : undefined, lesson: lesson.title } : undefined);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lesson) return ai === null && !drill ? null : { missing: true };
  return ctl ? { ctl, take, lesson, version } : null;
}
