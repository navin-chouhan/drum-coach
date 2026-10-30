// The lesson player's wiring to the iPad: the app's hit bus and MIDI clock, the AudioPort (clicks, count-in words, the
// voice), Storage (settings, runs, coach lessons), the home server's coach, today's set, interruptions (D6).
import { MILESTONES } from '@drum-coach/core/content/curriculum';
import type { Lesson } from '@drum-coach/core/engine/lesson';
import { SPOKEN_CUES } from '@drum-coach/core/engine/liveCoach';
import type { PadId } from '@drum-coach/core/engine/kit';
import type { AudioEvent } from '@drum-coach/core/play/audioPort';
import { router } from 'expo-router';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { AppState } from 'react-native';
import { getHomeServer } from '../../platform/api';
import { audio } from '../../platform/audio';
import { getMidiPort } from '../../platform/midi';
import { getStorage } from '../../platform/storage';
import { getAppHitBus } from '../../ui/hooks';
import { allLessons } from '../journey/source';
import { createCoachSession } from './coach';
import { LessonController, type LessonDeps } from './controller';
import { createLocalTake, type LocalTake } from './localTake';
import { todayKey } from './progress';
import { findLesson, itemDonePatch, lessonHref, nextItem, setItemOf, type LessonParams } from './route';
import { createSettingsStore } from './settings';

const COUNT_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
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

/** The iPad's voice: a prepared word (AudioPort words, D6) played now. */
function speak(text: string) {
  const t = text.replace(/[🏆✓★]/gu, '').trim();
  if (!t || !audio.available) return;
  void audio.prepareWords([t]).then(r => { if (!r.missing.length) audio.playNow(`word.${t}`, 1); }).catch(() => {});
}

export type LessonHandle = { ctl: LessonController; take: LocalTake; lesson: Lesson; version: number };

export function useLesson(params: LessonParams): LessonHandle | { missing: true } | null {
  const storage = getStorage();
  const settings = useMemo(() => createSettingsStore(storage.kv), [storage]);
  const [ai, setAi] = useState<unknown[] | null>(null);
  useEffect(() => { let live = true; void (storage.aiLessons?.list() ?? Promise.resolve([])).then(l => { if (live) setAi(l); }, () => { if (live) setAi([]); }); return () => { live = false; }; }, [storage]);
  const lessons = useMemo(() => allLessons(ai ?? []), [ai]);
  const lesson = findLesson(lessons, params.id);
  const [version, bump] = useReducer((n: number) => n + 1, 0);

  const take = useMemo(() => {
    const port = getMidiPort(), bus = getAppHitBus(), route = audio.available ? audio.route() : null;
    return createLocalTake({
      clock: port.clock, onHit: bus.onHit,
      settings: () => { const s = settings.get(); return { latencyMs: s.latencyMs, liveTips: s.liveTips, chattiness: s.chattiness, countIn: s.countIn }; },
      sound: audio.available ? { schedule: (ev: AudioEvent[]) => { audio.schedule(ev); }, cancel: () => audio.cancel() } : undefined,
      leadMs: Math.max(300, (route?.minLeadMs ?? 0) + 100),
      onCue: c => { if (settings.get().liveTips === 'voice') speak(c.spoken); },
    });
  }, [settings]);

  // The audio engine and the words the count-in and live tips say, prepared before the first take.
  useEffect(() => {
    if (!audio.available) return;
    void audio.start().then(() => audio.prepareWords([...COUNT_WORDS, ...SPOKEN_CUES])).catch(() => {});
  }, []);
  // The take's clock loop: plans sounds, gives live tips, ends the take (~20×/s).
  useEffect(() => { const t = setInterval(() => take.tick(), 50); return () => clearInterval(t); }, [take]);

  const ctl = useMemo(() => {
    if (!lesson) return null;
    const today = todayKey();
    const it = setItemOf(settings.get(), params.item, lesson.id, today);
    const exists = (id: string) => !!findLesson(lessons, id);
    const coach = createCoachSession({
      server: getHomeServer(), enabled: () => settings.get().liveCoach,
      context: async () => (await storage.coachContext('session')).context,
    });
    const next = nextItem(settings.get().session, params.item, today, exists);
    const deps: LessonDeps = {
      setup: { lesson, role: it?.role, minutes: it?.minutes, hasNext: !!next, flow: params.mode === 'flow', arcade: params.mode === 'arcade' },
      take, settings, lessons: () => lessons, lessonById: id => findLesson(lessons, id), milestones: MILESTONES, today: todayKey,
      saveRun: run => storage.runs.add(run), coach,
      say: speak,
      flourish: big => {
        if (!audio.available) return;
        const at = audio.clock.now() + (audio.route()?.minLeadMs ?? 100) + 50;
        audio.schedule((big ? BIG_FILL : FILL).map(([pad, dt]) => ({ kind: 'sound', at: at + dt * 1000, sound: `drum.${pad}`, gain: 110 / 127 })));
      },
      drillExists: id => (id.startsWith('lesson/') ? exists(id.split('/')[1]) : false),
      onBack: () => { if (router.canGoBack()) router.back(); else router.replace('/' as never); },
      onNext: next ? () => router.replace(lessonHref(next.lessonId, next.index) as never) : undefined,
      onItemDone: () => { const p = itemDonePatch(settings.get(), params.item, todayKey()); if (p.session) settings.set(p); },
      openLatency: () => router.navigate('/setup' as never),
    };
    return new LessonController(deps);
    // one controller per lesson and item; the lesson list only fills in coach lessons
  }, [lesson?.id, params.item, params.mode, take]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ctl) return;
    const off = ctl.subscribe(bump);
    if (params.mode === 'hear') ctl.play(true);
    // D6: a call, Siri, an alarm or the app going to the background ends the take at its last whole bar.
    const offAudio = audio.onInterruption(e => { if (e.type === 'began' || e.type === 'engine-stopped') ctl.interrupt(); });
    const offApp = AppState.addEventListener('change', s => { if (s !== 'active') ctl.interrupt(); });
    return () => { off(); offAudio(); offApp.remove(); ctl.dispose(); };
  }, [ctl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lesson) return ai === null ? null : { missing: true };
  return ctl ? { ctl, take, lesson, version } : null;
}
