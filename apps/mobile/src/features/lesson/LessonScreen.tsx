// The lesson player on the shared full-screen player (D10, src/player; wireframes docs/mobile/reorg/lesson-*-after.png).
// Ready: the bar (‹, title + "Step 3 of 4", □□ 2 clean → 75, BPM, ⋯), the coach's line, the music full width, one row
// of moves. Take: only "Bar 3 / 4", one tip, the BPM, the music, the touch pads when no kit is plugged in, ■ Stop.
// Results: a big 46/48 with the stars, one fix and its button, "Ask the coach ›". The rest is behind ⋯. The logic is
// the controller's (src/lesson/LessonPlayer.tsx ported); this file only lays it out.
import { useEffect, useMemo, useReducer, useState } from 'react';
import { Alert, Linking, Modal, StyleSheet, View } from 'react-native';
import { beatsPerBar } from '@drum-coach/core/engine/chart';
import { audio } from '../../platform/audio';
import { useAudioEngine } from '../../platform/useAudio';
import { refocusKeyboard } from '../../platform/keyboard';
import { getMidiPort } from '../../platform/midi';
import { NotationView } from '../../notation';
import { KitView, NoteHighway, TouchPads, type PadHit, type Subscribe } from '../../play';
import type { DrumId } from '../../play/chartLike';
import {
  KeysLine, PlayToggles, PlayerFrame, PlayerScore, PlayerSheet, SheetSection, barGoal, phaseOf, sheetScaleFor, type PlayerMove,
} from '../../player';
import {
  Body, Button, Card, Display, Label, Pill, Strong, Toggle, color, gesturesFor,
  StepPills, TimingLineView, useAppKey, useAppSettings, useKitMoves, getAppHitBus, SheetPager, useSheetPages,
} from '../../ui';
import { CoachInspector } from '../coach';
import type { LessonController, MoveView } from './controller';
import { barCounter, countInAt, flowMeter, liveTip } from './live';
import { CelebrationModal, GoalText, RestCountdown } from './parts';
import { laneName, youtubeSearch } from './lessonView';
import { EarQuiz } from './EarQuiz';
import { HowItMoves } from './HowItMoves';
import { IntroSlides } from './IntroSlides';
import { Transcribe } from './Transcribe';
import { idleChart, replayResults, runChart, takenChart } from './runChart';
import { shareTake } from './shareTake';
import type { CoreTakePort } from './takePort';
import { useKitConnected } from './useLesson';
import { useSameList } from '../../ui/useSameList';

/** The Clock's now, one function for the screen's views (Clock.now is a method: called through its port). */
const clockNow = () => getMidiPort().clock.now();

const RESULTS_SCALE = 1.1;
const GESTURE: Record<MoveView['gesture'], 'yes' | 'listen' | 'slower' | 'next'> = { yes: 'yes', tom2: 'listen', floor: 'slower', ride: 'next' };
const laneDrum = (d: string): DrumId => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d) as DrumId;
const splitEmoji = (label: string) => { const m = label.match(/^(\p{Extended_Pictographic}️?|[▶⏭⏱✓←])\s*/u); return m ? { emoji: m[1], text: label.slice(m[0].length) } : { emoji: undefined, text: label }; };

/** Re-renders `ms` apart while `on` (count-in number, bar counter, live tip). */
function useTicker(on: boolean, ms = 100) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => { if (!on) return; const t = setInterval(tick, ms); return () => clearInterval(t); }, [on, ms]);
}

export function LessonScreen({ ctl, take }: { ctl: LessonController; take: CoreTakePort }) {
  useAudioEngine(); // the engine runs while this play screen is shown: touch pads sound before the first take (QA2 M2)
  const v = ctl.view();
  const settings = useAppSettings();
  const kit = useKitConnected();
  const clock = getMidiPort().clock;
  const now = clock.now();
  useTicker(v.playing);
  const [more, setMore] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [shareNote, setShareNote] = useState<string>();
  const [bigDemo, setBigDemo] = useState(false); // "How it moves" full size, over the lesson (web bigDemo)
  const [kitDrawing, setKitDrawing] = useState(false); // D10: no kit drawing while a real kit is plugged in, unless asked in ⋯
  const bus = getAppHitBus();
  const hits: Subscribe<PadHit> = useMemo(() => fn => bus.onHit(h => { if (h.pad) fn({ pad: h.pad, velocity: h.velocity, at: h.time }); }), [bus]);
  const overlayOpen = more || coachOpen || !!v.celebration || !!v.intro || bigDemo;

  // Kit gestures (engine/padCommands.ts): the moves between takes, crash × 4 stops a take.
  useKitMoves({
    yes: () => ctl.padCommand('yes'), slower: () => ctl.padCommand('slower'), faster: () => ctl.padCommand('faster'),
    next: () => ctl.padCommand('next'), listen: () => ctl.padCommand('listen'), stop: () => ctl.padCommand('stop'),
  }, { playing: v.playing, enabled: !overlayOpen && !v.resting?.quiz }); // slides and quizzes take the kit's taps
  // The web's lesson keys (src/lesson/LessonPlayer.tsx): H hints, B the band on / off. Esc is the player's (a take
  // stops, else ‹), the coach panel's and the demo's while they're open.
  useAppKey('h', () => ctl.toggleHints());
  useAppKey('b', () => ctl.toggleBand());
  useAppKey('escape', () => { if (!coachOpen) return false; setCoachOpen(false); return true; }, { enabled: coachOpen });
  useAppKey('escape', () => setBigDemo(false), { enabled: bigDemo });

  const s = take.state, pos = v.playing ? take.position(now) : 0;
  const bpb = s.run?.beatsPerBar ?? beatsPerBar(v.chart);
  const countIn = v.playing ? countInAt(pos, bpb) : undefined;
  const tip = v.playing ? liveTip(s, now) : '';
  const f = v.results ? v.take : undefined;
  const takeChart = v.playing ? runChart(s) : undefined;
  const idle = useMemo(() => ({ chart: idleChart(v.chart), zero: clock.now() + 1e9 }), [v.chart]); // eslint-disable-line react-hooks/exhaustive-deps -- one standing sheet per chart (its zero must not move)
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- a finished take is never changed (core play/take.ts); the compiler only sees it passed to shareTake below
  const done = useMemo(() => (f ? { chart: takenChart(f), results: replayResults(f) } : undefined), [f]);
  const pager = useSheetPages(f); // a long take's results sheet: every page, one at a time
  const myPads = useSameList(v.myPads);
  const activeDrums = useMemo(() => [...new Set(myPads.map(laneDrum))], [myPads]);

  // The sheet's zoom fits the paper's height (player/sheetFit.ts). The results sheet uses the narrow zoom: two bars a
  // row and two rows, so a 4-bar take shows without paging (D10; with hints the auto zoom kept one bar a row).
  const [paperH, setPaperH] = useState(0);
  const scale = sheetScaleFor(paperH);
  const music = (() => {
    const highway = v.playView === 'highway';
    const common = { now: clockNow, style: styles.musicInner } as const;
    if (takeChart && s.options) {
      const bpm = takeChart.bpm * s.options.speed;
      return highway
        ? <NoteHighway {...common} chart={takeChart} bpm={bpm} zero={s.zero} latencyMs={settings.latencyMs} results={take.results} testID="lesson-highway" />
        : <NotationView {...common} chart={takeChart} bpm={bpm} zero={s.zero} latencyMs={settings.latencyMs} results={take.results} hints={v.hints} leftHanded={!!settings.leftHanded} scale={scale} testID="lesson-sheet" />;
    }
    if (f && done) {
      const bpm = f.chart.bpm * f.options.speed, frozen = () => f.zero;
      return highway
        ? <NoteHighway now={frozen} style={styles.musicInner} chart={done.chart} bpm={bpm} zero={f.zero} latencyMs={0} results={done.results} testID="lesson-highway" />
        : <NotationView now={frozen} style={styles.musicInner} chart={done.chart} bpm={bpm} zero={f.zero} latencyMs={0} results={done.results} hints={v.hints} leftHanded={!!settings.leftHanded} scale={RESULTS_SCALE}
          page={pager.page} onPages={pager.setPages} testID="lesson-sheet" />;
    }
    const bpm = v.frame.bpm;
    return highway
      ? <NoteHighway {...common} chart={idle.chart} bpm={bpm} zero={idle.zero} latencyMs={0} testID="lesson-highway" />
      : <NotationView {...common} chart={idle.chart} bpm={bpm} zero={idle.zero} latencyMs={0} hints={v.hints} leftHanded={!!settings.leftHanded} scale={scale} testID="lesson-sheet" />;
  })();

  const share = async () => {
    if (!v.take) return;
    const r = await shareTake(v.take, v.lesson.title);
    setShareNote(r === 'failed' ? "Couldn't make the MIDI file." : undefined);
  };
  const confirmReset = () => Alert.alert('Reset this lesson?', `Reset "${v.lesson.title}" to step 1 at the starting tempo? Your saved runs stay in Progress.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: () => { ctl.resetLesson(); setMore(false); } }]);
  const closeMore = (then: () => void) => () => { setMore(false); then(); };

  const upNext = v.outcome?.event === 'up' ? v.frame.bpm : undefined;
  const card = v.results?.card;

  // Voice (D10): R6 says the step intro (useLesson.ts) and every take's score (controller.ts speakTake); the frame only shows.

  // One row of moves: a rest, look or listen step has one ("done"); a quiz or transcription has its own; a break, one.
  const moves: PlayerMove[] = v.onBreak
    ? [{ id: 'break-done', label: 'Back to playing', emoji: '✓', onPress: () => ctl.endBreak(), testID: 'lesson-break-done' }]
    : v.resting && (v.resting.quiz || v.resting.transcribe) ? []
    : (v.resting ? v.moves.slice(0, 1) : v.moves).map(m => {
      const { emoji, text } = splitEmoji(m.label);
      return { id: m.id, label: text, emoji, gestures: gesturesFor(GESTURE[m.gesture]), note: m.id === 'main' ? 'or say "yes"' : undefined,
        onPress: m.run, tone: m.id === 'main' ? 'go' : m.id === 'listen' ? 'white' : 'alt', testID: `lesson-${m.id === 'main' ? 'main-move' : m.id}` };
    });

  const rest = v.onBreak ? <RestCountdown seconds={120} /> : v.resting ? (
    <View style={styles.restWrap}>
      {v.resting.quiz ? <EarQuiz key={v.frame.stepIdx} kind={v.resting.quiz} chart={v.chart} onDone={() => ctl.finishRest()} play={(c, then) => ctl.playClip(c, 1, then)} />
        : v.resting.transcribe ? <Transcribe key={v.frame.stepIdx} chart={v.chart} onDone={() => ctl.finishRest()} play={c => ctl.playClip(c, 2)} />
        : v.resting.listen ? <Card tone="cream" testID="lesson-listen">
          <Display size={24}>🎧 {v.resting.listen.song}</Display>
          <Body size={18}>Listen for: {v.resting.listen.what}</Body>
          <Button tone="blue" emoji="▶" label="Find it on YouTube" onPress={() => void Linking.openURL(youtubeSearch(v.resting!.listen!.song))} testID="lesson-listen-youtube" style={{ alignSelf: 'flex-start' }} />
          <Body size={15} color={color.muted}>Listen two or three times, eyes closed, then tap along on your knee before you come back.</Body>
        </Card>
        : v.resting.look ? <HowItMoves id={v.demo} bpm={v.frame.bpm} heelUp={v.heelUp} playing={v.playing} style={styles.look} testID="lesson-look" />
        : <RestCountdown key={v.frame.stepIdx} seconds={v.resting.seconds ?? 0} />}
    </View>
  ) : undefined;

  // Under the music (ready and take): touch pads without a kit; with a kit, its drawing only when asked for in ⋯.
  const bottom = !kit
    ? <TouchPads emitPad={(pad, vel, time) => bus.emitPad(pad, vel, time)} playNow={audio.available ? (snd, g) => audio.playNow(snd, g) : undefined}
      now={clockNow} activeDrums={activeDrums} results={take.results} style={styles.fill} testID="lesson-touch-pads" />
    : kitDrawing ? <KitView hits={hits} results={take.results} activeDrums={activeDrums} style={styles.fill} onPadPress={pad => bus.emitPad(pad, 96)} /> : undefined;

  const barTip = countIn !== undefined ? '"one, two, three, four"' : s.options?.endless ? flowMeter(s, pos, now) : tip ? tip.slice(3) : undefined;

  return (
    <PlayerFrame
      phase={phaseOf({ playing: v.playing && !v.resting, hasResults: !!v.results })}
      testID="lesson"
      title={v.header.title}
      subtitle={`${v.header.stepOf} · ${v.header.sub}`}
      goal={v.results ? undefined : barGoal({ boxes: v.boxes, bpm: v.frame.bpm, target: v.frame.step.bpm.target, lastStep: v.frame.lastStep })}
      barChip={upNext ? <Pill tone="green">→ {upNext} next</Pill> : undefined}
      bpm={v.header.tempo}
      onBack={() => ctl.back()}
      onMore={() => setMore(true)}
      coach={{ line: v.line, under: [v.under, v.timeUp ? "That's your minutes for this one." : undefined].filter(Boolean).join('\n') || undefined, pill: v.thinking ? 'Coach is listening back…' : undefined }}
      music={music}
      onPaperHeight={setPaperH}
      musicFoot={v.results && v.playView !== 'highway' ? <SheetPager v={pager} onPrev={pager.prev} onNext={pager.next} testID="lesson-sheet-pages" /> : undefined}
      side={v.results ? (card ? (
        <PlayerScore testID="lesson-take-card" head={`${f ? Math.round(f.chart.bpm * f.options.speed) : v.frame.bpm} BPM`} big={card.big} of={card.unit || undefined}
          label={card.label} stars={card.stars} fix={card.reason ?? v.results.latencyHint}
          fixMove={v.results.fix ? { label: v.results.fix.detail, onPress: () => ctl.zoomIn(v.results!.fix!.bar) } : undefined} fixTestID="lesson-fix-bar"
          onAskCoach={() => setCoachOpen(true)} askTestID="lesson-ask-coach">
          {card.needed ? <Body size={14} color={color.muted}>{card.needed}</Body> : null}
          {card.chips.map(c => <Body key={c} size={14} weight="600">{c}</Body>)}
        </PlayerScore>
      ) : (
        <PlayerScore testID="lesson-take-card" head="Your take" big="✓" label={v.results.latencyHint} onAskCoach={() => setCoachOpen(true)} askTestID="lesson-ask-coach" />
      )) : undefined}
      bottom={bottom}
      moves={moves}
      take={v.playing && !v.resting ? { bar: countIn !== undefined ? 'Count-in' : barCounter(s, pos).text.replace(' of ', ' / '), tip: barTip, onStop: () => ctl.stop(), countIn } : undefined}
      overlayOpen={overlayOpen}
      body={rest}
    >
      {v.celebration ? <CelebrationModal c={v.celebration} onNext={() => ctl.celebrationNext()} onAgain={() => ctl.celebrationAgain()} onClose={() => ctl.closeCelebration()} /> : null}

      <PlayerSheet open={more} onClose={() => setMore(false)} testID="lesson-more">
        <PlayToggles testID="lesson" view={v.playView} onView={x => ctl.setPlayView(x)} hints={v.hints} onHints={() => ctl.toggleHints()}
          band={v.band.available ? v.band.on : undefined} onBand={v.band.available ? () => ctl.toggleBand() : undefined} />
        {kit ? (
          <View style={styles.row}>
            <Body size={16} weight="700" style={styles.fill}>🥁 Show the kit drawing</Body>
            <Toggle value={kitDrawing} onChange={setKitDrawing} label="Show the kit drawing" testID="lesson-kit-drawing" />
          </View>
        ) : null}
        <SheetSection title="This step">
          {v.header.pills.length ? <StepPills pills={v.header.pills} label={v.header.stepOf} /> : null}
          {v.header.ladder ? <Body size={14} weight="700">Tempo ladder: {v.header.tempo} BPM now · {v.header.ladder.caption}</Body> : null}
          <GoalText goal={v.goal} size={18} />
          {kit ? <Body size={14}>Your pads: {v.myPads.map(laneName).join(', ')}</Body> : null}
        </SheetSection>
        {v.results ? (
          <SheetSection title="This take">
            {v.results.marks ? <Body size={14} weight="700">● on it  ● early / late  ◌ missed  ✕ extra</Body> : null}
            {v.results.timing ? <TimingLineView line={v.results.timing} /> : null}
            {v.results.fills.map(x => x.kept
              ? <Body key={x.bar} size={14}>✓ fill {x.n} kept</Body>
              : <Button key={x.bar} size="small" emoji="💾" label={`Keep fill ${x.n}`} onPress={() => ctl.keepFill(x.bar)} />)}
            {v.results.canShare ? <Button tone="pop" emoji="📤" label="Share take" onPress={() => void share()} testID="lesson-share" /> : null}
            {shareNote ? <Body size={13} color={color.bad}>{shareNote}</Body> : null}
            {v.results.canHearRight ? <Button emoji="👂" label="Hear it right" onPress={closeMore(() => ctl.play(true))} /> : null}
            {v.results.helpKey ? <Button emoji="🧑‍🏫" label="Ask the coach for something different" onPress={closeMore(() => ctl.askHelp())} /> : null}
            {v.results.latencyHint ? <Body size={14} color={color.bad}>{v.results.latencyHint}</Body> : null}
          </SheetSection>
        ) : null}
        <SheetSection title="The lesson">
          <Body size={16}>{v.lessonCard.what}</Body>
          {v.lessonCard.hint ? <Body size={15}><Strong>💡 Hint:</Strong> {v.lessonCard.hint}</Body> : null}
          {v.lessonCard.lines.map(l => <Body key={l} size={14}>{l}</Body>)}
          <Label>Why and how</Label>
          <Body size={14}>{v.lessonCard.why}</Body>
          <Body size={14}>{v.lessonCard.how}</Body>
          {v.needsLatency ? <Body size={14} color={color.bad}>This lesson is judged in milliseconds. Run the latency test first (⚙ Setup → Latency → Measure), or "behind the beat" may just be your speakers.</Body> : null}
          <Button emoji="🤸" label="How it moves" onPress={closeMore(() => setBigDemo(true))} testID="lesson-how-it-moves" />
          {v.canReset ? <Button tone="plain" label="Reset this lesson" onPress={confirmReset} testID="lesson-reset" /> : null}
        </SheetSection>
        <KeysLine />
      </PlayerSheet>

      <CoachInspector visible={coachOpen && !!v.take} kitMoves={false} take={v.take} takeExtras={{ chartId: v.take?.chart.id, lesson: v.take?.options.lesson }}
        onClose={() => setCoachOpen(false)} nextLabel={v.moves.find(m => m.id === 'skip')?.label.replace(/^⏭\s*/, '') ?? 'Next ▶'} />

      {v.intro ? <IntroSlides intro={v.intro} heelUp={v.heelUp} onNext={() => ctl.introNext()} onBack={() => ctl.introBack()} onClose={() => ctl.introClose()} /> : null}

      {bigDemo ? (
        <Modal visible transparent animationType="fade" supportedOrientations={['landscape']} onRequestClose={() => setBigDemo(false)} onShow={refocusKeyboard} onDismiss={refocusKeyboard}>
          <View style={styles.demoScrim}>
            <Card style={styles.bigDemo} testID="lesson-big-demo">
              <View style={styles.demoHead}>
                <Display size={22}>How it moves</Display>
                <Button label="✕ Close (Esc)" onPress={() => setBigDemo(false)} testID="lesson-big-demo-close" />
              </View>
              <HowItMoves id={v.demo} bpm={v.frame.bpm} heelUp={v.heelUp} playing={v.playing} style={styles.fill} />
            </Card>
          </View>
        </Modal>
      ) : null}
    </PlayerFrame>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  musicInner: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  restWrap: { flex: 1, justifyContent: 'center' },
  look: { flex: 1, width: '60%', alignSelf: 'center' }, // the drawing and its controls fit the height; the words scroll
  bigDemo: { flex: 1, padding: 18, gap: 10 },
  demoScrim: { flex: 1, backgroundColor: 'rgba(20,20,20,0.55)', padding: 30 },
  demoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
