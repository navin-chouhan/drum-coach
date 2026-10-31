// Practice's play screen (full screen, the web's PlayView): the exercise, − / + tempo with your best clean tempo, the
// coach line and the moves with their kit gestures, the sheet music of the bars you loop, times round, Climb, How it
// plays, and your takes here. Takes run on the core take engine (engine.ts); a finished one is saved and Climb applies.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Finished, TakeBacking } from '@drum-coach/core/play/take';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NotationView } from '../../notation';
import { TouchPads } from '../../play';
import type { DrumId } from '../../play/chartLike';
import { audio } from '../../platform/audio';
import { getMidiPort } from '../../platform/midi';
import type { RunsRepo } from '../../data/runs';
import { getStorage } from '../../platform/storage';
import {
  BigMove, Body, Button, Card, CardTitle, CoachLine, Display, Label, MAX_FONT_SCALE, Pill, Screen, Toggle,
  color, getAppHitBus, gesturesFor, hardShadow, shadow, slopFor, stroke, tabular, useAppSettings, useKitMoves, writeSettings,
} from '../../ui';
import { useStoredData } from '../progress/useStoredData';
import { studentRead } from '@drum-coach/core/engine/planner';
import { getCoach, replyFor, setCoachPlaying, thinkingAbout, useCoachSession, type Act } from '../coach';
import { SheetPager } from '../lesson/parts';
import { replayResults, runChart, takenChart } from '../lesson/runChart';
import { useSheetPages } from '../lesson/sheetPages';
import { backingFor, prepareBacking } from '../songs/backing';
import { useKitConnected } from '../lesson/useLesson';
import { kindIcon, startOf, type PracticeChart } from './catalog';
import { loadPracticeCharts } from './charts';
import { warmRepeats } from './chooser';
import { interruptedNote, practiceEngine } from './engine';
import { Dots, Notice } from './parts';
import {
  barPickKind, clampRepeats, climbAfterTake, flipChip, howItPlays, nextChartId, pickBar, playGesture, playModel, readPlayOptions, sectionChart,
  sectionRange, speedFor, writePlayOptions, type PracticeOptions, type Section, type WarmState,
} from './play';

const now = () => getMidiPort().clock.now();

export function PlayScreen() {
  const params = useLocalSearchParams<{ chartId?: string; bpm?: string; warm?: string }>();
  const kv = getStorage().kv;
  const settings = useAppSettings();
  const { data, reload } = useStoredData();
  const charts = useMemo(() => loadPracticeCharts(), []);
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
  // The last scored take of this chart on this screen (not a demo): the moves and the line follow it.
  const f = !playing && eng.finished && eng.chartId === chart.id ? eng.finished : undefined;
  const [climbedFor, setClimbedFor] = useState<Finished>();
  // What next: the coach's suggestion when it answered this take, otherwise the rule (the web's PlayView).
  const coach = useCoachSession(), session = getCoach().session;
  const [opened] = useState(Date.now);
  const scored = f && !f.options.demo ? f : undefined;
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

  const start = (c: PracticeChart, bpm: number, extra: { demo?: boolean; repeats?: number } = {}, sec: Section = section) => {
    const speed = speedFor(bpm, c.bpm);
    if (c.id !== o.chartId || speed !== o.speed) set({ chartId: c.id, speed });
    setNotice('');
    const run = (backing?: TakeBacking) => {
      if (!practiceEngine.start({ chart: c, options: { ...o, chartId: c.id, speed }, section: sec, hints, band: settings.band !== false, backing, ...extra })) setNotice(practiceEngine.notReady);
    };
    // An imported chart's own audio plays under the take (the web's go()): loaded first, and without it on a failure.
    if (!backingFor(c)) { run(); return; }
    void prepareBacking(c).then(r => { if (r.error) setNotice(r.error); run(r.backing); });
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
  const listen = () => go(m.bpm, { demo: true });
  const next = () => { set({ chartId: nextChartId(charts, chart.id) }); setSection(null); };
  const playAt = (bpm: number) => go(bpm);
  const stop = () => { setWarm(undefined); practiceEngine.stop(); };
  useKitMoves({
    yes: main, listen, next, stop,
    faster: () => { const a = playGesture('faster', m.bpm); if (a?.kind === 'playAt') playAt(a.bpm); },
    slower: () => { const a = playGesture('slower', m.bpm); if (a?.kind === 'playAt') playAt(a.bpm); },
  }, { playing });
  const flip = (id: Parameters<typeof flipChip>[0]) => {
    const p = flipChip(id, o, settings);
    if (p.options) set(p.options);
    if (p.settings) writeSettings(kv, p.settings);
  };
  // The coach learns what "this" is; it never talks over a take.
  useEffect(() => { session.coachOpen(chart, m.bpm); }, [chart.id, m.bpm]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setCoachPlaying(playing, playing ? { exercise: chart.title, bpm: m.bpm } : undefined);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => setCoachPlaying(false), []);
  // The coach's actions (its suggestion, a "yes" in the panel), as the web's onCoachAction on this screen.
  const acts = useRef({ main, listen, next, playAt, go, bpm: m.bpm });
  acts.current = { main, listen, next, playAt, go, bpm: m.bpm };
  useEffect(() => session.onCoachAction((a: Act) => {
    const x = acts.current;
    if (a.kind === 'main') { x.main(); return true; }
    if (a.kind === 'listen') { x.listen(); return true; }
    if (a.kind === 'next') { x.next(); return true; }
    if (a.bpm) { x.playAt(a.bpm); return true; }
    if (a.kind === 'slower' || a.kind === 'faster') { x.playAt(x.bpm + (a.kind === 'slower' ? -5 : 5)); return true; }
    x.go(); return true;
  }), []); // eslint-disable-line react-hooks/exhaustive-deps -- one handler, reads the latest moves
  const back = () => { stop(); if (router.canGoBack()) router.back(); else router.replace('/practice'); };
  const cue = playing ? eng.take?.state.cue?.cue.text : undefined;

  return (
    <Screen withSidebar={false} testID="screen-practice-play">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.bar}>
        <Button label="All exercises" emoji="←" size="small" onPress={back} testID="practice-play-back" />
        <View style={styles.titleBox}>
          <Display size={24} color={color.white} numberOfLines={1}>{chart.title}</Display>
          <Body size={13} color={color.pop} weight="700">{`${kindIcon(chart)} ${chart.kind ?? 'exercise'}${chart.source === 'ai' ? ' · ✍ by your coach' : ''}${warm ? ` · warm-up ${warm.i + 1} of ${warm.ids.length}` : ''}`}</Body>
        </View>
        <View style={styles.tempo} testID="practice-tempo">
          <Step label="−" a11y="5 BPM slower" onPress={() => set({ speed: speedFor(m.bpm - 5, chart.bpm) })} testID="practice-slower" />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.bpm, tabular]} accessibilityLabel={`${m.bpm} BPM`}>{m.bpm}<Text style={styles.bpmUnit}> BPM</Text></Text>
          <Step label="+" a11y="5 BPM faster" onPress={() => set({ speed: speedFor(m.bpm + 5, chart.bpm) })} testID="practice-faster" />
          {m.best > 0 ? <Body size={13} color={color.white} weight="700">{`best clean here: ${m.best} BPM`}</Body> : null}
        </View>
        <Button label="Hints" emoji="💡" size="small" tone={hints ? 'pop' : 'white'} onPress={() => flip('hints')} accessibilityLabel={`Hints ${hints ? 'on' : 'off'}`} testID="practice-hints" />
      </View>

      {playing ? (
        <View style={styles.playingRow}>
          <CoachLine size={20} style={styles.grow} testID="practice-live-tip">{cue ?? (eng.demo ? 'Listen: this is how it goes.' : `${chart.title} at ${m.bpm}.`)}</CoachLine>
          <BigMove tone="night" emoji="⏹" label="Stop" gestures={gesturesFor('stop')} onPress={stop} testID="practice-stop" style={styles.stop} />
        </View>
      ) : <>
      <View style={styles.coachRow}>
        <CoachLine size={20} style={styles.grow} testID="practice-coach-line">{m.line}</CoachLine>
        {thinking ? <View testID="practice-coach-thinking"><Pill tone="pop">Coach is listening back…</Pill></View> : null}
      </View>
      <View style={styles.moves}>
        <BigMove tone="go" label={m.main.label.replace(/^\S+ /, '')} emoji={m.main.label.split(' ')[0]} gestures={gesturesFor('yes')} onPress={main} testID="practice-main" style={styles.moveGo} />
        {m.moves.map(mv => (
          <BigMove key={mv.id} tone={mv.id === 'listen' ? 'white' : 'alt'} label={mv.label.replace(/^\S+ /, '')} emoji={mv.label.split(' ')[0]}
            gestures={mv.id === 'listen' ? gesturesFor('listen') : mv.id === 'faster' ? gesturesFor('faster') : mv.id === 'slower' ? gesturesFor('slower') : mv.id === 'next' ? gesturesFor('next') : []}
            onPress={mv.id === 'listen' ? listen : mv.id === 'next' ? next : () => playAt(mv.bpm ?? m.bpm)} testID={`practice-move-${mv.id}`} style={styles.move} />
        ))}
      </View>
      </>}
      {eng.error ? <Notice text={eng.error} testID="practice-error" /> : null}
      {notice ? <Notice text={notice} onClose={() => setNotice('')} testID="practice-notice" /> : null}
      {!playing && eng.interrupted && eng.chartId === chart.id ? <Notice text={interruptedNote(eng.interrupted)} testID="practice-interrupted" /> : null}

      <View style={styles.main}>
        <Card style={styles.music}>
          <View style={styles.barPick}>
            <Body weight="800">{`${chart.bars} bar${chart.bars === 1 ? '' : 's'}`}</Body>
            {barPickKind(chart.bars) !== 'none' ? <>
              <Body weight="700">· Loop:</Body>
              <Chip on={!section} label="All" onPress={() => setSection(null)} />
              {barPickKind(chart.bars) === 'buttons'
                ? Array.from({ length: chart.bars }, (_, i) => i + 1).map(b => <Chip key={b} on={!!section && b >= from && b <= to} label={String(b)} onPress={() => setSection(pickBar(section, b))} />)
                : <>
                  <Chip on={false} label="−" a11y="Loop starts a bar earlier" onPress={() => setSection({ from: Math.max(1, from - 1), to })} />
                  <Body weight="800">{`${from} to ${to}`}</Body>
                  <Chip on={false} label="+" a11y="Loop ends a bar later" onPress={() => setSection({ from, to: Math.min(chart.bars, to + 1) })} />
                </>}
            </> : null}
            <Body weight="700">·</Body>
            <Chip on={false} label="−" a11y="Fewer times round" onPress={() => set({ repeats: clampRepeats(o.repeats - 1) })} />
            <Body weight="800">{`${o.repeats}× round`}</Body>
            <Chip on={false} label="+" a11y="More times round" onPress={() => set({ repeats: clampRepeats(o.repeats + 1) })} />
          </View>
          <View style={styles.sheet}>
            {live && liveChart
              ? <NotationView chart={liveChart} bpm={m.bpm} zero={live.zero} now={now} latencyMs={settings.latencyMs} results={practiceEngine.results} hints={hints} leftHanded={!!settings.leftHanded} testID="practice-sheet" />
              : done && scored
                ? <NotationView chart={done.chart} bpm={scored.chart.bpm * scored.options.speed} zero={scored.zero} now={() => scored.zero} latencyMs={0} results={done.results} hints={hints}
                  leftHanded={!!settings.leftHanded} page={pager.page} onPages={pager.setPages} testID="practice-sheet" />
                : <NotationView chart={shown} bpm={m.bpm} zero={idleZero} now={now} latencyMs={settings.latencyMs} hints={hints} leftHanded={!!settings.leftHanded} testID="practice-sheet" />}
          </View>
          {done && !live ? <SheetPager v={pager} onPrev={pager.prev} onNext={pager.next} tone="light" testID="practice-sheet-pages" /> : null}
          {done && !live ? <Body size={13} weight="800">● on it  ● early / late  ◌ missed  ✕ extra</Body> : null}
          {hints ? <Body size={13} color={color.muted}>R right hand · L left hand · K kick · H hi-hat foot</Body> : null}
          {!kit ? (
            <View style={styles.pads}>
              <TouchPads emitPad={(pad, vel, time) => getAppHitBus().emitPad(pad, vel, time)} playNow={audio.available ? (snd, g) => audio.playNow(snd, g) : undefined}
                now={getMidiPort().clock.now} activeDrums={activeDrums} results={live ? practiceEngine.results : undefined} style={styles.grow1} testID="practice-touch-pads" />
            </View>
          ) : null}
          <View style={styles.goal}>
            <Body size={13} weight="800">{`Your drums: ${myPads.join(', ')}`}</Body>
            <View style={styles.climb}>
              <Toggle value={!!o.climb} onChange={v => set({ climb: v })} label="Climb" testID="practice-climb" />
              <View style={styles.grow}>
                <Body size={14}><Text style={styles.b}>Climb</Text>{`: after 2 clean takes the tempo goes up 5, until ${m.cap}.`}</Body>
                <Body size={12.5} color={color.muted}>{o.climb ? 'On: it climbs by itself.' : 'Off: the tempo stays where you put it.'}</Body>
              </View>
            </View>
          </View>
        </Card>

        <ScrollView style={styles.side} contentContainerStyle={styles.sideIn}>
          {chart.description ? <Card><CardTitle size={17}>What it is</CardTitle><Body>{chart.description}</Body></Card> : null}
          <Card>
            <CardTitle size={17}>How it plays</CardTitle>
            <View style={styles.chips}>
              {howItPlays(o, settings).map(c => (
                <Pressable key={c.id} onPress={() => flip(c.id)} accessibilityRole="switch" accessibilityState={{ checked: c.on }} accessibilityLabel={`${c.label}, ${c.note}`}
                  testID={`practice-chip-${c.id}`} style={[styles.chip, c.on && styles.chipOn]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.chipLabel}>{c.label}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.chipNote}>{c.note}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
          <Card>
            <CardTitle size={17}>Your takes here</CardTitle>
            {m.recent.length > 1 ? <Dots values={m.recent} width={220} label={`Notes landed in your last ${m.recent.length} takes, percent`} /> : null}
            <Body size={14}>{m.history}</Body>
          </Card>
          <Card>
            <Label>Just the click</Label>
            <Button label="Metronome" emoji="🔔" size="small" onPress={() => router.push('/practice/metronome')} testID="practice-play-metronome" style={styles.metro} />
          </Card>
        </ScrollView>
      </View>
    </Screen>
  );
}

function Step({ label, a11y, onPress, testID }: { label: string; a11y: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} testID={testID} hitSlop={slopFor(44)}
      style={({ pressed }) => [styles.step, pressed && styles.pressed]}>
      <Text style={styles.stepText}>{label}</Text>
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
  bar: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: color.night, borderWidth: stroke.card, borderColor: color.ink, boxShadow: hardShadow(shadow.card, color.pop), paddingVertical: 8, paddingHorizontal: 14 },
  titleBox: { flex: 1, minWidth: 0 },
  tempo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bpm: { fontSize: 34, fontWeight: '900', color: color.white, minWidth: 70, textAlign: 'center' },
  bpmUnit: { fontSize: 13, color: color.pop },
  step: { width: 52, height: 52, borderRadius: 26, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.pop, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 30, fontWeight: '900', color: color.ink, lineHeight: 34 },
  pressed: { opacity: 0.7 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  playingRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  stop: { width: 260, minHeight: 88 },
  moves: { flexDirection: 'row', gap: 12, marginTop: 12 },
  moveGo: { flex: 1.6, minHeight: 88 },
  move: { flex: 1, minHeight: 88 },
  main: { flex: 1, flexDirection: 'row', gap: 16, marginTop: 14 },
  music: { flex: 1, minWidth: 0, gap: 8, paddingVertical: 10 },
  barPick: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  barChip: { minWidth: 34, height: 34, paddingHorizontal: 8, borderRadius: 17, borderWidth: stroke.thin, borderColor: color.ink, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center' },
  barChipOn: { backgroundColor: color.pop },
  barChipText: { fontSize: 15, fontWeight: '800', color: color.ink },
  pads: { height: 150 },
  grow1: { flex: 1 },
  sheet: { flex: 1, minHeight: 100, backgroundColor: '#FFFDF6', borderWidth: stroke.thin, borderColor: color.ink },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 16, justifyContent: 'space-between' },
  climb: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  grow: { flexShrink: 1 },
  b: { fontWeight: '900' },
  side: { width: 300, flexGrow: 0 },
  sideIn: { gap: 12, paddingBottom: 8, paddingRight: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { width: '48%', minHeight: 44, paddingVertical: 4, paddingHorizontal: 8, borderWidth: stroke.thin, borderColor: color.ink, backgroundColor: color.panel },
  chipOn: { backgroundColor: color.pop },
  chipLabel: { fontSize: 13.5, fontWeight: '800', color: color.ink },
  chipNote: { fontSize: 11.5, fontWeight: '600', color: color.muted },
  metro: { marginTop: 6 },
});
