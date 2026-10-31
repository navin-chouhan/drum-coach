// Practice's play screen (the web's PlayView) on the shared player (D10, src/player): the bar (‹, title, Climb chip,
// − BPM +, ⋯), the coach line, the sheet music as large as it fits, the score card after a take, and the moves
// (Again / Hear / Slower / Faster / Next, with their kit gestures). Loop bars, times round, How it plays, Climb, kit
// sounds, song sync, Your takes here and the Metronome are in ⋯. Takes run on the core take engine (engine.ts); a
// finished one is saved and Climb applies.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Finished, TakeBacking } from '@drum-coach/core/play/take';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NotationView } from '../../notation';
import { TouchPads } from '../../play';
import type { DrumId } from '../../play/chartLike';
import { audio } from '../../platform/audio';
import { useAudioEngine } from '../../platform/useAudio';
import { getMidiPort } from '../../platform/midi';
import type { RunsRepo } from '../../data/runs';
import { getStorage } from '../../platform/storage';
import {
  Body, Button, MAX_FONT_SCALE, Screen, Toggle, color, getAppHitBus, gesturesFor, slopFor, stroke, useAppSettings, useKitMoves, writeSettings,
  CheckRow, Dots, KIT_SOUNDS_LABEL, Notice, SheetPager, Stepper, useSheetPages, TempoLadder, TimingLineView,
} from '../../ui';
import { useStoredData } from '../progress/useStoredData';
import { studentRead } from '@drum-coach/core/engine/planner';
import { getCoach, replyFor, setCoachPlaying, thinkingAbout, useCoachSession, type Act } from '../coach';
import { replayResults, runChart, takenChart } from '../lesson/runChart';
import { ResultsDetails } from '../results/ResultsDetails';
import { SYNC_NUDGES, backingFor, nudgeSync, prepareBacking } from '../songs/backing';
import { takeMarks, timingLine } from '../lesson/results';
import { ladderRungs } from '../lesson/lessonView';
import { takeChart } from '@drum-coach/core/engine/transcribe';
import { useKitConnected } from '../lesson/useLesson';
import { kindIcon, startOf, type PracticeChart } from './catalog';
import { loadPracticeCharts } from './charts';
import { warmRepeats } from './chooser';
import { interruptedNote, practiceEngine } from './engine';
import { IntroSlides } from '../lesson/IntroSlides';
import { speakMoment } from '../coach/voice';
import { KeysLine, PlayerFrame, PlayerScore, PlayerSheet, SheetSection, phaseOf, scoreParts, sheetScaleFor, takeBarText, type PlayerMove } from '../../player';
import {
  barNow, barPickKind, clampRepeats, moreCard, needsIntro, yourTakeCard, climbAfterTake, flipChip, howItPlays, nextChartId, pickBar, playGesture, playModel, readPlayOptions, sectionChart,
  sectionRange, speedFor, writePlayOptions, type PracticeOptions, type Section, type WarmState,
} from './play';

const now = () => getMidiPort().clock.now();
const YOUR_TAKE = 'your-take'; // the chart id of a take played back (Hear your take)

export function PlayScreen() {
  useAudioEngine(); // the engine runs while this play screen is shown: touch pads sound before the first take (QA2 M2)
  const params = useLocalSearchParams<{ chartId?: string; bpm?: string; warm?: string }>();
  const kv = getStorage().kv;
  const settings = useAppSettings();
  const { data, reload } = useStoredData();
  const charts = useMemo(() => loadPracticeCharts(), [params.chartId]); // read anew per request (a chart saved since)
  const [o, setO] = useState<PracticeOptions>(() => readPlayOptions(kv));
  const set = (patch: Partial<PracticeOptions>) => setO(prev => writePlayOptions(kv, prev, patch));
  const [section, setSection] = useState<Section>(null);
  const [notice, setNotice] = useState('');
  const runs = data?.runs ?? [];
  const read = useMemo(() => studentRead(settings.lessons, runs), [settings.lessons, runs]);
  const eng = useSyncExternalStore(practiceEngine.subscribe, practiceEngine.get);
  const playing = eng.phase === 'playing' || eng.phase === 'starting';

  // "Play this" (from the chooser, Progress or the coach): select the chart, at the tempo asked for exactly.
  const warmIds = params.warm ? params.warm.split(',').filter(id => charts.some(c => c.id === id)) : [];
  const [warm, setWarm] = useState<WarmState | undefined>(() => warmIds.length > 1
    ? { i: 0, ids: warmIds, titles: warmIds.map(id => charts.find(c => c.id === id)!.title), done: false } : undefined);
  useEffect(() => {
    const target = charts.find(c => c.id === params.chartId);
    if (!target) return;
    const bpm = Number(params.bpm);
    set({ chartId: target.id, ...(bpm > 0 && { speed: speedFor(bpm, target.bpm) }) });
    setSection(null);
  }, [params.chartId, params.bpm]); // eslint-disable-line react-hooks/exhaustive-deps -- once per request
  useEffect(() => () => practiceEngine.stop(), []);

  const chart = charts.find(c => c.id === o.chartId) ?? charts[0];
  // The last scored take of this chart on this screen (not a demo): the moves and the line follow it. Kept here, so
  // hearing it (or the exercise) afterwards doesn't lose it (the web's lastTake).
  const [lastTake, setLastTake] = useState<{ f: Finished; chartId: string }>();
  if (eng.finished && eng.chartId && !eng.finished.options.demo && eng.finished !== lastTake?.f) setLastTake({ f: eng.finished, chartId: eng.chartId });
  const f = !playing && lastTake && lastTake.chartId === chart.id ? lastTake.f : undefined;
  const [climbedFor, setClimbedFor] = useState<Finished>();
  // What next: the coach's suggestion when it answered this take, otherwise the rule (the web's PlayView).
  const coach = useCoachSession(), session = getCoach().session;
  const [opened] = useState(Date.now);
  const scored = f && !f.options.demo ? f : undefined;
  // "Details" (the web's "details and history" → Results): the last take in full, until a new take starts or Back.
  const [details, setDetails] = useState(false);
  const showDetails = details && !playing && scored ? scored : undefined;
  const reply = replyFor(coach, scored, opened);
  const act = session.screenAction(reply?.action, '⏭ Next one');
  const coachMove = act && session.canRunAction(act) ? act : undefined;
  const m = playModel({ chart, options: o, runs, read, playing, warm,
    take: f && { accuracy: f.stats.accuracy, hits: f.hits.length, wait: f.options.wait, demo: false, climbed: f === climbedFor },
    reply: reply && { line: reply.show ?? reply.say, ...(coachMove && { move: { label: coachMove.label } }) } });
  const thinking = !reply && !playing && thinkingAbout(coach, scored);
  const { from, to } = sectionRange(section, chart.bars);
  const shown = useMemo(() => sectionChart(chart, section), [chart, section]);
  const [idleZero] = useState(() => now() + 1e9); // before a take: the sheet stands still on its first page
  const hints = settings.hints !== false;
  // The sheet: the take's run while playing (coloured as it's judged), the finished take with its marks (paged), else
  // the bars you loop.
  const live = playing && eng.take ? eng.take.state : undefined;
  const liveChart = useMemo(() => (live ? runChart(live) : undefined), [live?.run]); // eslint-disable-line react-hooks/exhaustive-deps -- one per take
  const done = useMemo(() => (scored && !scored.options.wait && scored.results.length ? { chart: takenChart(scored), results: replayResults(scored) } : undefined), [scored]);
  const pager = useSheetPages(done);
  // After a take: the timing line (when the take played the chart on screen), the side card, and ⚙ More.
  const timing = useMemo(() => { const k = takeMarks(scored, chart, playing); return k && timingLine(k.offsets, k.missed, scored?.stats.extra ?? 0); }, [scored, chart, playing]);
  const card = scored && !playing ? yourTakeCard(scored) : undefined;
  const [, setSyncTick] = useState(0);
  const more = moreCard(settings.latencyMs, chart);
  const nudge = (ms: number) => {
    const charts = getStorage().charts;
    const next = charts ? nudgeSync(charts, chart, ms) : null;
    if (next === null) { setNotice('Song sync could not be saved.'); return; }
    chart.syncOffsetMs = next; // the list is read once per visit; this chart now carries the stored offset
    setSyncTick(t => t + 1);
  };
  const myPads = [...new Set(chart.notes.filter(n => !n.auto).map(n => n.drum))];
  // No kit connected: touch pads under the sheet, as the lesson player swaps them in (QA M2).
  const kit = useKitConnected();
  const activeDrums = useMemo(() => [...new Set(myPads.map(d => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d) as DrumId))], [myPads.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once a take is saved: the runs again (history, best), and Climb: 2 clean takes here move the tempo up 5.
  const latest = useRef({ chart, o, warm });
  latest.current = { chart, o, warm };
  useEffect(() => practiceEngine.onSaved(take => {
    reload();
    const { chart: c, o: cur, warm: w } = latest.current;
    // The coach hears each take here once (not the warm-up's), as the web's PlayView tells it.
    if (!w && take.chart.title === c.title) void getCoach().session.coachTake(take, { chartId: c.id });
    if (!cur.climb || w || take.interrupted || take.chart.title !== c.title) return; // an interrupted take never climbs (D6)
    void (getStorage().runs as RunsRepo).list().then(rs => {
      const speed = climbAfterTake(c, rs, cur.speed);
      if (speed) { set({ speed }); setClimbedFor(take); }
    }).catch(() => {});
  }), []); // eslint-disable-line react-hooks/exhaustive-deps -- one listener

  // The intro slides up (the web's PlayView intro): which one, and the take they start.
  const [intro, setIntro] = useState<{ run: () => void; chart: PracticeChart; bpm: number; sec: Section; i: number }>();
  const introNext = () => { if (!intro) return; if (intro.i >= 2) { setIntro(undefined); intro.run(); } else setIntro({ ...intro, i: intro.i + 1 }); };
  const introBack = () => { if (intro) setIntro({ ...intro, i: Math.max(0, intro.i - 1) }); };
  const introShown = useRef(new Map<string, number>());
  const start = (c: PracticeChart, bpm: number, extra: { demo?: boolean; repeats?: number } = {}, sec: Section = section) => {
    const speed = speedFor(bpm, c.bpm);
    if (c.id !== o.chartId || speed !== o.speed) set({ chartId: c.id, speed });
    setNotice('');
    setDetails(false);
    const run = (backing?: TakeBacking) => {
      if (!practiceEngine.start({ chart: c, options: { ...o, chartId: c.id, speed }, section: sec, hints, band: settings.band !== false, backing, ...extra })) setNotice(practiceEngine.notReady);
    };
    // An imported chart's own audio plays under the take (the web's go()): loaded first, and without it on a failure.
    const launch = () => {
      if (!backingFor(c)) { run(); return; }
      void prepareBacking(c).then(r => { if (r.error) setNotice(r.error); run(r.backing); });
    };
    // Intro slides before the first take of an exercise (or after a tempo jump of more than 10 BPM); not in the warm-up.
    const b = c.bpm * speed;
    if (needsIntro({ demo: extra.demo, warm: !!extra.repeats, wait: o.wait, introOn: settings.intro !== false, seenBpm: introShown.current.get(c.id), bpm: b })) {
      introShown.current.set(c.id, b);
      setIntro({ run: launch, chart: c, bpm: Math.round(b), sec, i: 0 });
      return;
    }
    launch();
  };
  const go = (bpm = m.bpm, extra: { demo?: boolean } = {}) => start(chart, bpm, extra);
  // The warm-up: about a minute of each at its tempo today; the next starts by itself 3 s after the last one ends.
  const warmTakeOf = useRef<unknown>(undefined);
  const warmTake = (i: number) => {
    const c = charts.find(x => x.id === warm?.ids[i]);
    if (!c || !warm) return;
    const bpm = startOf(c, runs, read);
    setSection(null);
    setWarm({ ...warm, i, done: false });
    start(c, bpm, { repeats: warmRepeats(c, bpm) }, null);
    warmTakeOf.current = practiceEngine.get().take;
  };
  useEffect(() => { if (warm) warmTake(0); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the warm-up starts when it opens
  useEffect(() => {
    if (!warm || eng.phase !== 'done' || warm.done || !eng.take || eng.take !== warmTakeOf.current) return;
    setWarm({ ...warm, done: true });
    if (warm.i + 1 >= warm.ids.length) { setWarm(undefined); return; }
    const t = setTimeout(() => warmTake(warm.i + 1), 3000);
    return () => clearTimeout(t);
  }, [eng.phase]); // eslint-disable-line react-hooks/exhaustive-deps -- once per finished take

  const main = () => {
    if (m.main.kind === 'stopWarm') { stop(); return; }
    if (m.main.kind === 'play') go(m.main.bpm);
    else if (coachMove) session.runAction(coachMove);
  };
  // Hear your take (its own hits played back, the web's takeChart), or the exercise before a take.
  const listen = () => {
    if (!f?.hits.length) { go(m.bpm, { demo: true }); return; }
    setNotice(''); setDetails(false);
    const own = { ...takeChart(f.hits, { zero: f.zero, beatMs: 60000 / (f.chart.bpm * f.options.speed), beats: f.run.beats, beatsPerBar: f.run.beatsPerBar, title: 'Your take', timeSignature: f.chart.timeSignature }), id: YOUR_TAKE };
    if (!practiceEngine.start({ chart: own, options: { ...o, chartId: own.id, speed: 1, wait: false }, section: null, hints, band: false, demo: true, repeats: 1 })) setNotice(practiceEngine.notReady);
  };
  const hearItRight = () => start(chart, m.bpm, { demo: true });
  const next = () => { set({ chartId: nextChartId(charts, chart.id) }); setSection(null); };
  const playAt = (bpm: number) => go(bpm);
  const stop = () => { setWarm(undefined); practiceEngine.stop(); };
  useKitMoves({
    yes: showDetails ? () => go() : main, listen, next, stop,
    faster: () => { const a = playGesture('faster', m.bpm); if (a?.kind === 'playAt') playAt(a.bpm); },
    slower: () => { const a = playGesture('slower', m.bpm); if (a?.kind === 'playAt') playAt(a.bpm); },
  }, { playing, enabled: !intro }); // the intro slides have the kit's taps
  const flip = (id: Parameters<typeof flipChip>[0]) => {
    const p = flipChip(id, o, settings);
    if (p.options) set(p.options);
    if (p.settings) writeSettings(kv, p.settings);
  };
  // The coach learns what "this" is; it never talks over a take.
  useEffect(() => { session.coachOpen(chart, m.bpm); }, [chart.id, m.bpm]); // eslint-disable-line react-hooks/exhaustive-deps
  // Voice first (D10): the exercise is said when it opens (not in the warm-up, which runs by itself).
  useEffect(() => { if (!warm) speakMoment({ kind: 'stepIntro', title: chart.title, what: chart.description ?? `${chart.bars} bar${chart.bars === 1 ? '' : 's'}, ${o.repeats} times round.`, bpm: m.bpm }); }, [chart.id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per exercise
  useEffect(() => {
    setCoachPlaying(playing, playing ? { exercise: chart.title, bpm: m.bpm } : undefined);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setCoachPlaying(false), []);
  // The coach's actions (its suggestion, a "yes" in the panel), as the web's onCoachAction on this screen.
  const acts = useRef({ main, listen, next, playAt, go, bpm: m.bpm, intro: !!intro, introNext });
  acts.current = { main, listen, next, playAt, go, bpm: m.bpm, intro: !!intro, introNext };
  useEffect(() => session.onCoachAction((a: Act) => {
    const x = acts.current;
    if (x.intro) { if (a.kind === 'main') x.introNext(); return true; } // the slides have the kit's taps: yes turns one, the rest is swallowed
    if (a.kind === 'main') { x.main(); return true; }
    if (a.kind === 'listen') { x.listen(); return true; }
    if (a.kind === 'next') { x.next(); return true; }
    if (a.bpm) { x.playAt(a.bpm); return true; }
    if (a.kind === 'slower' || a.kind === 'faster') { x.playAt(x.bpm + (a.kind === 'slower' ? -5 : 5)); return true; }
    x.go(); return true;
  }), []); // eslint-disable-line react-hooks/exhaustive-deps -- one handler, reads the latest moves
  const back = () => { stop(); if (router.canGoBack()) router.back(); else router.replace('/practice'); };
  const cue = playing ? eng.take?.state.cue?.cue.text : undefined;

  // The take's bar and count-in, ticking while it plays (the frame's "Bar 3 / 4").
  const [tick, setTick] = useState(0);
  useEffect(() => { if (!playing) return; const t = setInterval(() => setTick(x => x + 1), 200); return () => clearInterval(t); }, [playing]);
  const takeBar = live ? barNow(live, now()) : undefined; void tick;
  const [paperH, setPaperH] = useState(0);
  const scale = sheetScaleFor(paperH);
  const [moreOpen, setMoreOpen] = useState(false);
  const toPlayerMove = (mv: { id: string; label: string }, onPress: () => void, gestures: ReturnType<typeof gesturesFor>, testID: string): PlayerMove =>
    ({ id: mv.id, label: mv.label.replace(/^\S+ /, ''), emoji: mv.label.split(' ')[0], gestures, onPress, testID });
  const moves: PlayerMove[] = [
    toPlayerMove({ id: 'main', label: m.main.label }, main, gesturesFor('yes'), 'practice-main'),
    ...m.moves.map(mv => toPlayerMove(mv, mv.id === 'listen' ? listen : mv.id === 'next' ? next : () => playAt(mv.bpm ?? m.bpm),
      mv.id === 'listen' ? gesturesFor('listen') : mv.id === 'faster' ? gesturesFor('faster') : mv.id === 'slower' ? gesturesFor('slower') : mv.id === 'next' ? gesturesFor('next') : [],
      `practice-move-${mv.id}`)),
  ];
  const music = live && liveChart
    ? <NotationView chart={liveChart} bpm={m.bpm} zero={live.zero} now={now} latencyMs={settings.latencyMs} results={practiceEngine.results} hints={hints} leftHanded={!!settings.leftHanded} scale={scale} testID="practice-sheet" />
    : done && scored
      ? <NotationView chart={done.chart} bpm={scored.chart.bpm * scored.options.speed} zero={scored.zero} now={() => scored.zero} latencyMs={0} results={done.results} hints={hints}
        leftHanded={!!settings.leftHanded} page={pager.page} onPages={pager.setPages} scale={scale} testID="practice-sheet" />
      : <NotationView chart={shown} bpm={m.bpm} zero={idleZero} now={now} latencyMs={settings.latencyMs} hints={hints} leftHanded={!!settings.leftHanded} scale={scale} testID="practice-sheet" />;
  const loopWords = `Loop: ${section ? `bars ${from}–${to}` : 'all'} · ${o.repeats}×`;

  if (showDetails) {
    return (
      <Screen withSidebar={false} testID="screen-practice-play">
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.detailsIn}>
          <ResultsDetails f={showDetails} onAgain={() => go()} onBack={() => setDetails(false)} extras={{ chartId: chart.id }} testID="practice-details" />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <View style={styles.fill} testID="screen-practice-play">
      <Stack.Screen options={{ headerShown: false }} />
      <PlayerFrame
        phase={phaseOf({ playing, hasResults: !!card })}
        testID="practice"
        title={chart.title}
        subtitle={`${kindIcon(chart)} ${chart.kind ?? 'exercise'}${chart.source === 'ai' ? ' · ✍ by your coach' : ''}${warm ? ` · warm-up ${warm.i + 1} of ${warm.ids.length}` : ''} · ${loopWords}`}
        barChip={<ClimbChip on={!!o.climb} cap={m.cap} onPress={() => set({ climb: !o.climb })} />}
        bpm={m.bpm}
        onBpm={(d: -5 | 5) => set({ speed: speedFor(m.bpm + d, chart.bpm) })}
        onBack={back}
        onMore={() => setMoreOpen(true)}
        coach={{ line: m.line, ...(thinking && { pill: 'Coach is listening back…' }) }}
        music={music}
        onPaperHeight={setPaperH}
        musicFoot={done && !live ? <SheetPager v={pager} onPrev={pager.prev} onNext={pager.next} testID="practice-sheet-pages" /> : null}
        side={card ? (
          <PlayerScore head={`${m.bpm} BPM`} {...scoreParts(card.landed, card.total)} label="notes landed" testID="practice-your-take"
            fix={card.tip ? `💡 ${card.tip}` : undefined}>
            <Body size={13} color={color.muted}>{card.small}</Body>
            {card.latency ? <Notice text={card.latency} testID="practice-latency-hint" /> : null}
            <View style={styles.takeLinks}>
              <Button label="Details and history" emoji="📊" size="small" onPress={() => setDetails(true)} testID="practice-details-open" />
              <Button label="Hear it right" emoji="👂" size="small" onPress={hearItRight} testID="practice-hear-right" />
            </View>
          </PlayerScore>
        ) : undefined}
        bottom={!kit ? (
          <TouchPads emitPad={(pad, vel, time) => getAppHitBus().emitPad(pad, vel, time)} playNow={audio.available ? (snd, g) => audio.playNow(snd, g) : undefined}
            now={getMidiPort().clock.now} activeDrums={activeDrums} results={live ? practiceEngine.results : undefined} style={styles.fill} testID="practice-touch-pads" />
        ) : undefined}
        moves={moves}
        take={playing ? {
          bar: takeBarText(takeBar ?? { bar: 1 }), onStop: stop,
          tip: cue ?? (eng.demo ? 'Listen: this is how it goes.' : undefined),
          ...(takeBar?.countIn !== undefined && { countIn: takeBar.countIn }),
        } : undefined}
        overlayOpen={moreOpen || !!intro}
      >
        {eng.error || notice || (!playing && eng.interrupted && eng.chartId === chart.id) ? (
          <View style={styles.notices} pointerEvents="box-none">
            {eng.error ? <Notice text={eng.error} testID="practice-error" /> : null}
            {notice ? <Notice text={notice} onClose={() => setNotice('')} testID="practice-notice" /> : null}
            {!playing && eng.interrupted && eng.chartId === chart.id ? <Notice text={interruptedNote(eng.interrupted)} testID="practice-interrupted" /> : null}
          </View>
        ) : null}
        <PlayerSheet open={moreOpen} onClose={() => setMoreOpen(false)} testID="practice-more">
          <SheetSection title="Loop">
            <View style={styles.barPick}>
              <Body weight="800">{`${chart.bars} bar${chart.bars === 1 ? '' : 's'}`}</Body>
              {barPickKind(chart.bars) !== 'none' ? <>
                <Chip on={!section} label="All" onPress={() => setSection(null)} />
                {barPickKind(chart.bars) === 'buttons'
                  ? Array.from({ length: chart.bars }, (_, i) => i + 1).map(b => <Chip key={b} on={!!section && b >= from && b <= to} label={String(b)} onPress={() => setSection(pickBar(section, b))} />)
                  : <>
                    <Chip on={false} label="−" a11y="Loop starts a bar earlier" onPress={() => setSection({ from: Math.max(1, from - 1), to })} />
                    <Body weight="800">{`${from} to ${to}`}</Body>
                    <Chip on={false} label="+" a11y="Loop ends a bar later" onPress={() => setSection({ from, to: Math.min(chart.bars, to + 1) })} />
                  </>}
              </> : null}
            </View>
            <Stepper label="Times round" value={o.repeats} min={1} max={50} format={v => `${v}× round`} width={86}
              onChange={v => set({ repeats: clampRepeats(v) })} testID="practice-repeats" />
          </SheetSection>
          <SheetSection title="Climb">
            <View style={styles.climb}>
              <Toggle value={!!o.climb} onChange={v => set({ climb: v })} label="Climb" testID="practice-climb" />
              <Body size={14} style={styles.grow}>{`After 2 clean takes the tempo goes up 5, until ${m.cap}.`}</Body>
            </View>
            {o.climb ? <TempoLadder bpm={m.bpm} ladder={ladderRungs(m.bpm, Math.min(m.bpm, m.cap - 5), m.cap)} /> : null}
          </SheetSection>
          <SheetSection title="How it plays">
            <View style={styles.chips}>
              {howItPlays(o, settings).map(c => (
                <Pressable key={c.id} onPress={() => flip(c.id)} accessibilityRole="switch" accessibilityState={{ checked: c.on }} accessibilityLabel={`${c.label}, ${c.note}`}
                  testID={`practice-chip-${c.id}`} style={[styles.chip, c.on && styles.chipOn]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.chipLabel}>{c.label}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.chipNote}>{c.note}</Text>
                </Pressable>
              ))}
            </View>
          </SheetSection>
          {timing ? (
            <SheetSection title="This take">
              <TimingLineView line={timing} testID="practice-timing-line" />
              <Body size={13} weight="800">● on it  ● early / late  ◌ missed  ✕ extra</Body>
            </SheetSection>
          ) : null}
          <SheetSection title="Your takes here">
            {m.recent.length > 1 ? <Dots values={m.recent} width={220} label={`Notes landed in your last ${m.recent.length} takes, percent`} /> : null}
            <Body size={14}>{m.history}</Body>
          </SheetSection>
          <SheetSection title="Sound">
            <CheckRow label={KIT_SOUNDS_LABEL} value={!!settings.browserSounds} onChange={browserSounds => writeSettings(kv, { browserSounds })} testID="practice-kit-sounds" />
            {more.latency ? <Body size={13}>{more.latency}</Body> : null}
            {more.sync ? <>
              <Body size={13}>{more.sync}</Body>
              <View style={styles.takeLinks}>
                {SYNC_NUDGES.map(ms => <Button key={ms} size="small" label={`${ms > 0 ? '+' : ''}${ms}`} accessibilityLabel={`Song sync ${ms > 0 ? 'plus' : 'minus'} ${Math.abs(ms)} ms`}
                  onPress={() => nudge(ms)} testID={`practice-sync-${ms}`} />)}
              </View>
            </> : null}
            <Button label="Metronome" emoji="🔔" size="small" onPress={() => { setMoreOpen(false); router.push('/practice/metronome'); }} testID="practice-play-metronome" />
          </SheetSection>
          {chart.description ? <SheetSection title="What it is"><Body>{chart.description}</Body></SheetSection> : null}
          <KeysLine />
        </PlayerSheet>
        {intro ? (() => {
          // the web's practice slides: the bars you loop from beat 0, the last take's last tip, no "how it moves" slide
          const ic = intro.chart, bpb = (ic.timeSignature[0] * 4) / ic.timeSignature[1], { from: f0 } = sectionRange(intro.sec, ic.bars);
          return <IntroSlides onNext={introNext} onBack={introBack} onClose={() => setIntro(undefined)} intro={{
            i: intro.i, last: 2, title: ic.title, sub: ic.title, bpm: intro.bpm, what: ic.description ?? `${ic.bars} bar${ic.bars === 1 ? '' : 's'}, ${o.repeats} times round.`,
            notes: ic.notes.filter(n => n.t >= (f0 - 1) * bpb).map(n => ({ ...n, t: n.t - (f0 - 1) * bpb, mine: true })), beatsPerBar: bpb,
            focus: f?.cues.at(-1)?.text, leftHanded: !!settings.leftHanded,
          }} />;
        })() : null}
      </PlayerFrame>
    </View>
  );
}

/** Climb as a chip in the bar (D10): on, it says where it stops; tap to switch. */
function ClimbChip({ on, cap, onPress }: { on: boolean; cap: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={on ? `Climb on, up to ${cap}` : 'Climb off'}
      hitSlop={slopFor(36)} testID="practice-climb-chip" style={[styles.climbChip, on && styles.climbChipOn]}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.climbChipText, !on && styles.climbChipTextOff]}>{on ? `🧗 Climb → ${cap}` : '🧗 Climb off'}</Text>
    </Pressable>
  );
}

function Chip({ on, label, onPress, a11y }: { on: boolean; label: string; onPress: () => void; a11y?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={slopFor(34)} accessibilityRole="button" accessibilityLabel={a11y ?? (label.match(/^\d+$/) ? `Bar ${label}` : label)}
      accessibilityState={{ selected: on }} style={[styles.barChip, on && styles.barChipOn]}>
      <Text style={styles.barChipText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flexShrink: 1 },
  notices: { position: 'absolute', left: 24, right: 24, bottom: 130, gap: 8 },
  takeLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  barPick: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  barChip: { minWidth: 34, height: 34, paddingHorizontal: 8, borderRadius: 17, borderWidth: stroke.thin, borderColor: color.ink, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center' },
  barChipOn: { backgroundColor: color.pop },
  barChipText: { fontSize: 15, fontWeight: '800', color: color.ink },
  climb: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { width: '48%', minHeight: 44, paddingVertical: 4, paddingHorizontal: 8, borderWidth: stroke.thin, borderColor: color.ink, backgroundColor: color.panel },
  chipOn: { backgroundColor: color.pop },
  chipLabel: { fontSize: 13.5, fontWeight: '800', color: color.ink },
  chipNote: { fontSize: 11.5, fontWeight: '600', color: color.muted },
  climbChip: { height: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: stroke.thin, borderColor: color.white, justifyContent: 'center' },
  climbChipOn: { backgroundColor: color.pop, borderColor: color.ink },
  climbChipText: { fontSize: 14, fontWeight: '900', color: color.ink },
  climbChipTextOff: { color: color.white },
  detailsScroll: { flex: 1, marginTop: 14 },
  detailsIn: { paddingBottom: 24 },
});
