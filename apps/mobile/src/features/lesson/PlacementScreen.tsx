// "Find your level" (/lesson/placement), on the shared player (src/player): the web's PlacementView (src/ui/SkillMapView.tsx), which the first run opens
// for someone who has played before (drumcoach.firstRun.placement = '1', as the web's Onboarding → kit steps →
// placement), or Journey's "Find my level" any time later. One take of each stage's first challenge at its target tempo; the first one that doesn't pass is where
// you start. The rules are placement.ts; the take runs on the lesson player's TakePort (core take engine).
import { MILESTONES } from '@drum-coach/core/content/curriculum';
import { router } from 'expo-router';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { audio } from '../../platform/audio';
import { sayNow } from '../coach/voice';
import { useAudioEngine, useAudioInterruptions } from '../../platform/useAudio';
import { getMidiPort } from '../../platform/midi';
import { getStorage } from '../../platform/storage';
import { NotationView } from '../../notation';
import { TouchPads } from '../../play';
import type { DrumId } from '../../play/chartLike';
import { PlayerFrame, phaseOf, type PlayerMove } from '../../player';
import { gesturesFor, getAppHitBus, useAppKey, useAppSettings, useKitMoves } from '../../ui';
import { PLACEMENT_KEY } from '../firstRun/firstRun';
import { allLessons } from '../journey/source';
import { judgePlacement, ladderOf, placeAt, placementStep, rungLine } from './placement';
import { todayKey } from './progress';
import { barCounter } from './live';
import { idleChart, runChart } from './runChart';
import { createSettingsStore } from './settings';
import { sheetScaleFor } from '../../player/sheetFit';
import { createTakePort } from './takePort';
import { useKitConnected } from './useLesson';

/** An interruption ended the rung's take: it isn't judged (D6), so the same rung is played again. */
export const INTERRUPTED_NOTE = 'The take was interrupted, so it doesn’t count: play this one again when you’re ready.';

const laneDrum = (d: string): DrumId => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d) as DrumId;

export function PlacementScreen() {
  useAudioEngine(); // the engine runs while this play screen is shown: touch pads sound before the first take (QA2 M2)
  const storage = getStorage();
  const settings = useMemo(() => createSettingsStore(storage.kv), [storage]);
  const app = useAppSettings();
  const kit = useKitConnected();
  const bus = getAppHitBus();
  const clock = getMidiPort().clock;
  const [ai, setAi] = useState<unknown[]>([]);
  useEffect(() => { let live = true; void (storage.aiLessons?.list() ?? Promise.resolve([])).then(l => { if (live) setAi(l); }, () => {}); return () => { live = false; }; }, [storage]);
  const lessons = useMemo(() => allLessons(ai), [ai]);
  const byId = (id: string) => lessons.find(l => l.id === id);
  const ladder = useMemo(() => ladderOf(lessons, MILESTONES), [lessons]);
  const [i, setI] = useState(0);
  const [result, setResult] = useState<string>();
  const [last, setLast] = useState<string>();
  const [notice, setNotice] = useState('');
  const [paperH, setPaperH] = useState(0); // the sheet's zoom fits its paper (sheetFit.ts), as in the lesson player
  const item = ladder[i], lesson = item && byId(item.lessonId);
  const rung = lesson && placementStep(lesson);

  const take = useMemo(() => createTakePort({
    clock, audio, onHit: bus.onHit, sayWord: w => sayNow(w), // a count-in word the engine couldn't render
    settings: () => { const s = settings.get(); return { latencyMs: s.latencyMs, liveTips: s.liveTips, chattiness: s.chattiness, countIn: s.countIn }; },
  }), [settings]); // eslint-disable-line react-hooks/exhaustive-deps -- one per screen
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => take.subscribe(bump), [take]);
  useEffect(() => { const t = setInterval(() => take.tick(), 50); return () => { clearInterval(t); take.stop(); }; }, [take]);
  const playing = take.state.phase === 'playing';

  // The web's onDone: back to Journey with today's set planned again (rebuildToday), whichever way you leave.
  const leave = () => { take.stop(); settings.set({ session: undefined }); storage.kv.remove(PLACEMENT_KEY); router.replace('/' as never); };
  const finish = (level: number) => {
    take.stop();
    const r = placeAt(level, MILESTONES, settings.get().lessons, byId, todayKey());
    settings.set(r.patch);
    storage.kv.remove(PLACEMENT_KEY);
    setResult(r.result);
  };

  // Each finished take of this rung: passed → the next stage; not → start here.
  const judged = useRef(new WeakSet<object>());
  const f = take.state.finished;
  useEffect(() => {
    if (take.state.phase !== 'done' || !f || judged.current.has(f) || !lesson || !rung || f.chart.title !== rung.step.chart.title) return;
    judged.current.add(f);
    // D6: an interrupted take never moves the ladder (placement saves no runs): this rung is played again.
    if (f.interrupted) { setNotice(INTERRUPTED_NOTE); return; }
    const j = judgePlacement(f.stats, lesson);
    setLast(j.line);
    if (!j.ok) finish(item.level); else if (i + 1 >= ladder.length) finish(Infinity); else setI(i + 1);
  }, [f, take.state.phase]); // eslint-disable-line react-hooks/exhaustive-deps -- once per finished take

  const play = () => {
    if (!rung) return;
    if (!audio.available) { setNotice('Playing needs the iPad build with its audio engine.'); return; }
    setNotice('');
    take.start(rung.step.chart, rung.options);
  };
  useKitMoves({ yes: () => (result ? leave() : play()), stop: () => take.stop() }, { playing });
  // D6, as the lesson player: a call, Siri, the app leaving or a new audio output ends the take where it began.
  useAudioInterruptions(playing, at => {
    take.stop('interrupted', at);
    if (take.state.phase !== 'done') setNotice(INTERRUPTED_NOTE);
  });
  // A hardware keyboard: Enter plays (or starts there); Esc is the player's (stops a take, else leaves).
  useAppKey('enter', () => { if (playing) return false; if (result) leave(); else play(); return true; });

  const s = take.state;
  const live = playing ? runChart(s) : undefined;
  const idle = useMemo(() => (rung ? { chart: idleChart(rung.step.chart), zero: clock.now() + 1e9 } : undefined), [rung?.step]); // eslint-disable-line react-hooks/exhaustive-deps
  const bpm = rung ? rung.step.bpm.target : 0;
  const activeDrums = rung ? [...new Set((rung.step.activeLanes ?? rung.step.chart.notes.map(n => n.drum)).map(laneDrum))] : [];

  const moves: PlayerMove[] = result
    ? [{ id: 'start-there', label: 'Start there', emoji: '▶', gestures: gesturesFor('yes'), onPress: leave, testID: 'placement-start-there' }]
    : item && lesson && rung ? [
      { id: 'play', label: 'Play it', emoji: '▶', gestures: gesturesFor('yes'), onPress: play, testID: 'placement-play' },
      { id: 'here', label: 'Start at this stage', emoji: '⏹', onPress: () => finish(item.level), disabled: playing, tone: 'white', testID: 'placement-here' },
      { id: 'leave', label: 'From the beginning', emoji: '↩', note: 'stop the test', onPress: leave, testID: 'placement-leave' },
    ] : [{ id: 'back', label: 'Back', emoji: '‹', onPress: leave, testID: 'placement-back' }];
  const pos = playing ? take.position(clock.now()) : 0;

  return (
    <PlayerFrame
      phase={phaseOf({ playing, hasResults: false })}
      testID="placement"
      title="Find your level"
      subtitle={item && lesson ? `Stage ${i + 1} of ${ladder.length} · ${lesson.title}` : undefined}
      bpm={rung ? bpm : undefined}
      onBack={leave}
      coach={result
        ? { line: result, under: last, testID: 'placement-result' }
        : item && lesson && rung ? { line: rungLine(i, ladder.length, lesson), under: [last ? `✓ ${last}` : '', notice].filter(Boolean).join('\n') || undefined, testID: 'placement-rung' }
        : { line: 'No stages to place you in yet.' }}
      music={rung ? (live && s.options
        ? <NotationView chart={live} bpm={live.bpm * s.options.speed} zero={s.zero} now={clock.now} latencyMs={app.latencyMs} results={take.results} hints leftHanded={!!app.leftHanded} scale={sheetScaleFor(paperH)} testID="placement-sheet" />
        : idle ? <NotationView chart={idle.chart} bpm={bpm} zero={idle.zero} now={clock.now} latencyMs={0} hints leftHanded={!!app.leftHanded} scale={sheetScaleFor(paperH)} testID="placement-sheet" /> : null) : null}
      onPaperHeight={setPaperH}
      bottom={rung && !result && !kit ? <TouchPads emitPad={(pad, vel, time) => bus.emitPad(pad, vel, time)} playNow={audio.available ? (snd, g) => audio.playNow(snd, g) : undefined}
        now={clock.now} activeDrums={activeDrums} results={take.results} style={styles.fill} testID="placement-touch-pads" /> : undefined}
      body={result ? <View style={styles.fill} /> : undefined}
      moves={moves}
      take={playing ? { bar: barCounter(s, pos).text.replace(' of ', ' / '), onStop: () => take.stop() } : undefined}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
