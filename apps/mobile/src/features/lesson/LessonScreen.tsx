// The lesson player (A7b): full screen, no sidebar. Before → count-in → take → results, as the approved mockups draw
// them (lesson-ready, lesson-countin, lesson-take-sheet / lesson-take, lesson-results-sheet / lesson-results,
// lesson-share). The logic is the controller's (src/lesson/LessonPlayer.tsx ported); this file only lays it out.
import { useEffect, useMemo, useReducer, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { beatsPerBar } from '@drum-coach/core/engine/chart';
import { audio } from '../../platform/audio';
import { getMidiPort } from '../../platform/midi';
import { NotationView } from '../../notation';
import { KitView, NoteHighway, TouchPads, type PadHit, type Subscribe } from '../../play';
import type { DrumId } from '../../play/chartLike';
import {
  Body, BigMove, Button, Card, CoachLine, Display, DottedGround, Label, Pill, Segmented, Strong, color, gesturesFor, hardShadow, shadow, stroke,
  StepPills, TempoLadder, TimingLineView, useAppKey, useAppSettings, useKitMoves, getAppHitBus,
} from '../../ui';
import { CoachInspector } from '../coach';
import type { LessonController, MoveView } from './controller';
import { barCounter, countInAt, flowMeter, liveTip } from './live';
import {
  Banner, Boxes, CelebrationModal, CountInBadge, GoalText, MoreSheet, RestCountdown, RoundButton, SheetPager, TakeCardView,
} from './parts';
import { useSheetPages } from './sheetPages';
import { laneName } from './lessonView';
import { idleChart, replayResults, runChart, takenChart } from './runChart';
import { shareTake } from './shareTake';
import type { CoreTakePort } from './takePort';
import { useKitConnected } from './useLesson';

const GESTURE: Record<MoveView['gesture'], 'yes' | 'listen' | 'slower' | 'next'> = { yes: 'yes', tom2: 'listen', floor: 'slower', ride: 'next' };
const laneDrum = (d: string): DrumId => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d) as DrumId;
const splitEmoji = (label: string) => { const m = label.match(/^(\p{Extended_Pictographic}️?|[▶⏭⏱✓←])\s*/u); return m ? { emoji: m[1], text: label.slice(m[0].length) } : { emoji: undefined, text: label }; };

/** Re-renders `ms` apart while `on` (count-in number, bar counter, live tip). */
function useTicker(on: boolean, ms = 100) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => { if (!on) return; const t = setInterval(tick, ms); return () => clearInterval(t); }, [on, ms]);
}

export function LessonScreen({ ctl, take }: { ctl: LessonController; take: CoreTakePort }) {
  const insets = useSafeAreaInsets();
  const v = ctl.view();
  const settings = useAppSettings();
  const kit = useKitConnected();
  const clock = getMidiPort().clock;
  const now = clock.now();
  useTicker(v.playing);
  const [more, setMore] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [shareNote, setShareNote] = useState<string>();
  const bus = getAppHitBus();
  const hits: Subscribe<PadHit> = useMemo(() => fn => bus.onHit(h => { if (h.pad) fn({ pad: h.pad, velocity: h.velocity, at: h.time }); }), [bus]);

  // Kit gestures (engine/padCommands.ts): the moves between takes, crash × 4 stops a take.
  useKitMoves({
    yes: () => ctl.padCommand('yes'), slower: () => ctl.padCommand('slower'), faster: () => ctl.padCommand('faster'),
    next: () => ctl.padCommand('next'), listen: () => ctl.padCommand('listen'), stop: () => ctl.padCommand('stop'),
  }, { playing: v.playing, enabled: !more && !coachOpen && !v.celebration });
  // A hardware keyboard's Esc stops the take (the app-wide keyboard, ui/useAppKey; its drum keys go to the hit bus).
  useAppKey('escape', () => { if (!v.playing) return false; ctl.stop(); return true; });

  const s = take.state, pos = v.playing ? take.position(now) : 0;
  const bpb = s.run?.beatsPerBar ?? beatsPerBar(v.chart);
  const countIn = v.playing ? countInAt(pos, bpb) : undefined;
  const tip = v.playing ? liveTip(s, now) : '';
  const f = v.results ? v.take : undefined;
  const takeChart = v.playing ? runChart(s) : undefined;
  const idle = useMemo(() => ({ chart: idleChart(v.chart), zero: clock.now() + 1e9 }), [v.chart]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = useMemo(() => (f ? { chart: takenChart(f), results: replayResults(f) } : undefined), [f]);
  const pager = useSheetPages(f); // a long take's results sheet: every page, one at a time
  const activeDrums = useMemo(() => [...new Set(v.myPads.map(laneDrum))], [v.myPads.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const music = (() => {
    const highway = v.playView === 'highway';
    const common = { now: clock.now, style: styles.musicInner } as const;
    if (takeChart && s.options) {
      const bpm = takeChart.bpm * s.options.speed;
      return highway
        ? <NoteHighway {...common} chart={takeChart} bpm={bpm} zero={s.zero} latencyMs={settings.latencyMs} results={take.results} testID="lesson-highway" />
        : <NotationView {...common} chart={takeChart} bpm={bpm} zero={s.zero} latencyMs={settings.latencyMs} results={take.results} hints={v.hints} leftHanded={!!settings.leftHanded} testID="lesson-sheet" />;
    }
    if (f && done) {
      const bpm = f.chart.bpm * f.options.speed, frozen = () => f.zero;
      return highway
        ? <NoteHighway now={frozen} style={styles.musicInner} chart={done.chart} bpm={bpm} zero={f.zero} latencyMs={0} results={done.results} testID="lesson-highway" />
        : <NotationView now={frozen} style={styles.musicInner} chart={done.chart} bpm={bpm} zero={f.zero} latencyMs={0} results={done.results} hints={v.hints} leftHanded={!!settings.leftHanded}
          page={pager.page} onPages={pager.setPages} testID="lesson-sheet" />;
    }
    const bpm = v.frame.bpm;
    return highway
      ? <NoteHighway {...common} chart={idle.chart} bpm={bpm} zero={idle.zero} latencyMs={0} testID="lesson-highway" />
      : <NotationView {...common} chart={idle.chart} bpm={bpm} zero={idle.zero} latencyMs={0} hints={v.hints} leftHanded={!!settings.leftHanded} testID="lesson-sheet" />;
  })();

  const share = async () => {
    if (!v.take) return;
    const r = await shareTake(v.take, v.lesson.title);
    setShareNote(r === 'failed' ? "Couldn't make the MIDI file." : undefined);
  };
  const confirmReset = () => Alert.alert('Reset this lesson?', `Reset "${v.lesson.title}" to step 1 at the starting tempo? Your saved runs stay in Progress.`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: () => { ctl.resetLesson(); setMore(false); } }]);

  const upNext = v.outcome?.event === 'up' ? v.frame.bpm : undefined;

  return (
    <DottedGround>
      {/* The black top bar */}
      <View style={[styles.bar, { paddingTop: Math.max(insets.top, 20) + 6, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 }]}>
        {!v.playing ? <RoundButton label="Back to Journey" glyph="‹" onPress={() => ctl.back()} testID="lesson-back" /> : null}
        <View style={styles.titleBox}>
          <Display size={22} color={color.white} numberOfLines={1}>{v.header.title}</Display>
          <Body size={13} weight="700" color="#CFCFCF" numberOfLines={1}>{v.header.stepOf} · {v.header.sub}</Body>
        </View>
        <StepPills pills={v.header.pills} label={v.header.stepOf} />
        <Segmented testID="lesson-view-toggle" accessibilityLabel="Notes view" value={v.playView} onChange={x => ctl.setPlayView(x)}
          options={[{ value: 'sheet', label: 'Sheet' }, { value: 'highway', label: 'Highway' }]} />
        <View style={{ flex: 1 }} />
        <TempoLadder bpm={v.header.tempo} ladder={v.results ? undefined : v.header.ladder} />
        {v.playing ? <>
          <View style={styles.stopChip}><Text style={styles.stopChipText}>● crash × 4</Text></View>
          <Button tone="red" emoji="■" label="Stop" onPress={() => ctl.stop()} testID="lesson-stop" accessibilityHint="Or crash four times, or Esc" />
        </> : v.results ? <>
          {upNext ? <Pill tone="green">→ {upNext} next</Pill> : null}
          {v.results.canShare ? <Button tone="pop" emoji="📤" label="Share take" onPress={() => void share()} testID="lesson-share" /> : null}
          <RoundButton label="More" glyph="⋯" onPress={() => setMore(true)} testID="lesson-more-button" />
        </> : <>
          <Button size="small" tone={v.hints ? 'pop' : 'white'} emoji="💡" label="Hints" onPress={() => ctl.toggleHints()} testID="lesson-hints" accessibilityHint="Key H" />
          {v.band.available ? <Button size="small" tone={v.band.on ? 'pop' : 'white'} emoji="🎸" label={`Band ${v.band.on ? 'on' : 'off'}`} onPress={() => ctl.toggleBand()} testID="lesson-band" accessibilityHint="Key B" /> : null}
          <RoundButton label="More" glyph="⋯" onPress={() => setMore(true)} testID="lesson-more-button" />
        </>}
      </View>

      <View style={[styles.body, { paddingLeft: insets.left + 24, paddingRight: insets.right + 24, paddingBottom: Math.max(insets.bottom, 12) + 14 }]}>
        {v.playing ? (
          countIn !== undefined
            ? <Banner tone="cream" emoji="🥁" text={`Count-in: one bar, then ${barCounter(s, 0).of ?? ''} bars at ${v.frame.bpm}`} right={'"one, two, three, four"'} testID="lesson-countin" />
            : s.options?.endless ? <Banner tone="pop" emoji="🌊" text={flowMeter(s as never, pos, now)} testID="lesson-flow" />
            : <Banner tone={tip ? 'pop' : 'cream'} emoji={tip ? '💡' : '🥁'} text={tip ? tip.slice(3) : barCounter(s, pos).text} testID="lesson-tip" />
        ) : <>
          <View style={styles.coachRow}>
            <CoachLine size={22} style={{ flex: 1 }} testID="lesson-coach-line">
              {v.line}{v.under ? `\n${v.under}` : ''}
            </CoachLine>
            {v.thinking ? <Pill tone="pop" style={styles.thinking}>Coach is listening back…</Pill> : null}
          </View>
          {!v.onBreak ? <View style={styles.moves}>
            {v.moves.map(m => {
              const { emoji, text } = splitEmoji(m.label);
              return <BigMove key={m.id} label={text} emoji={emoji} tone={m.id === 'main' ? 'go' : m.id === 'listen' ? 'white' : 'alt'}
                gestures={gesturesFor(GESTURE[m.gesture])} note={m.id === 'main' ? 'or say "yes"' : undefined}
                onPress={m.run} testID={`lesson-${m.id === 'main' ? 'main-move' : m.id}`} style={m.id === 'main' ? styles.mainMove : styles.move} />;
            })}
          </View> : <View style={styles.moves}>
            <BigMove label="Back to playing" emoji="✓" tone="go" onPress={() => ctl.endBreak()} testID="lesson-break-done" style={styles.mainMove} />
          </View>}
        </>}

        {v.onBreak ? <RestCountdown seconds={120} /> : v.resting ? (
          <View style={styles.restWrap}>
            {v.resting.listen ? <Card tone="cream" testID="lesson-listen">
              <Display size={24}>🎧 {v.resting.listen.song}</Display>
              <Body size={18}>Listen for: {v.resting.listen.what}</Body>
              <Body size={15} color={color.muted}>Listen two or three times, eyes closed, then tap along on your knee before you come back.</Body>
            </Card> : v.resting.seconds ? <RestCountdown key={v.frame.stepIdx} seconds={v.resting.seconds} />
              : <Card tone="cream"><Body size={18}>This step ({v.frame.step.title}) is coming to the iPad later. Mark it done to move on.</Body></Card>}
          </View>
        ) : (
          <View style={styles.main}>
            <View style={[styles.musicPanel, v.results && { flex: 1 }]} testID="lesson-music">
              <View style={styles.musicHead}>
                <Label style={styles.musicLabel}>{v.results ? 'Your take, on the notes' : v.playing ? (countIn !== undefined ? 'Count-in' : barCounter(s, pos).text) : `Your ${v.frame.step.chart.bars === 1 ? 'bar' : `${v.frame.step.chart.bars} bars`} · ${v.frame.step.title}`}</Label>
                {v.results?.marks ? <Body size={13} weight="800" color={color.white}>● on it  ● early / late  ◌ missed  ✕ extra</Body> : null}
              </View>
              <View style={styles.musicRow}>
                {countIn !== undefined ? <CountInBadge n={countIn} /> : null}
                <View style={styles.musicPaper}>{music}</View>
              </View>
              {v.results && v.playView !== 'highway' ? <SheetPager v={pager} onPrev={pager.prev} onNext={pager.next} testID="lesson-sheet-pages" /> : null}
              {v.results?.timing ? <TimingLineView line={v.results.timing} /> : null}
            </View>

            {v.results ? (
              <View style={styles.side}>
                {v.results.card ? <TakeCardView card={v.results.card} head={`${f ? Math.round(f.chart.bpm * f.options.speed) : v.frame.bpm} BPM`} /> : null}
                {v.results.card?.reason || v.results.latencyHint ? (
                  <Card tone="cream" testID="lesson-fix" style={{ gap: 8 }}>
                    <Label>One thing to fix</Label>
                    <Body size={16} weight="700">{v.results.card?.reason ?? v.results.latencyHint}</Body>
                    {v.results.fix ? <Button emoji="🔁" label={v.results.fix.detail} onPress={() => ctl.zoomIn(v.results!.fix!.bar)} testID="lesson-fix-bar" /> : null}
                  </Card>
                ) : null}
                {v.results.fills.length ? <Card style={{ gap: 6 }}>{v.results.fills.map(x => x.kept
                  ? <Body key={x.bar} size={14}>✓ fill {x.n} kept</Body>
                  : <Button key={x.bar} size="small" emoji="💾" label={`Keep fill ${x.n}`} onPress={() => ctl.keepFill(x.bar)} />)}</Card> : null}
                {shareNote ? <Body size={13} color={color.bad}>{shareNote}</Body> : null}
                <Card tone="cream" onPress={() => setCoachOpen(true)} testID="lesson-ask-coach" accessibilityLabel="Ask the coach: feedback and a drill for this take" style={styles.askCoach}>
                  <Display size={18}>Ask the coach</Display>
                  <Body size={14}>Feedback and a drill for this take</Body>
                </Card>
              </View>
            ) : (
              <View style={styles.bottomRow}>
                <View style={[styles.goal, !kit && styles.goalNarrow]} testID="lesson-goal">
                  {v.boxes ? <Boxes n={v.boxes.n} ok={v.boxes.ok} /> : null}
                  <GoalText goal={v.goal} size={kit ? 22 : 18} />
                </View>
                <View style={[styles.kit, !kit && styles.kitTouch]} testID="lesson-kit">
                  <Body size={13} weight="800" color={color.white}>{kit ? `Your pads: ${v.myPads.map(laneName).join(', ')}` : 'Touch pads (no kit connected): tap to play'}</Body>
                  {kit
                    ? <KitView hits={hits} results={take.results} activeDrums={activeDrums} style={{ flex: 1 }} onPadPress={pad => bus.emitPad(pad, 96)} />
                    : <TouchPads emitPad={(pad, vel, time) => bus.emitPad(pad, vel, time)} playNow={audio.available ? (snd, g) => audio.playNow(snd, g) : undefined}
                      now={clock.now} activeDrums={activeDrums} results={take.results} style={{ flex: 1 }} testID="lesson-touch-pads" />}
                </View>
              </View>
            )}
          </View>
        )}
        {v.timeUp ? <Body size={14} weight="700">That's your minutes for this one.</Body> : null}
      </View>

      {v.celebration ? <CelebrationModal c={v.celebration} onNext={() => ctl.celebrationNext()} onAgain={() => ctl.celebrationAgain()} onClose={() => ctl.closeCelebration()} /> : null}

      <MoreSheet open={more} onClose={() => setMore(false)}>
        <Label>The lesson</Label>
        <Body size={16}>{v.lessonCard.what}</Body>
        {v.lessonCard.hint ? <Body size={15}><Strong>💡 Hint:</Strong> {v.lessonCard.hint}</Body> : null}
        {v.lessonCard.lines.map(l => <Body key={l} size={14}>{l}</Body>)}
        <Label>Why and how</Label>
        <Body size={14}>{v.lessonCard.why}</Body>
        <Body size={14}>{v.lessonCard.how}</Body>
        {v.needsLatency ? <Body size={14} color={color.bad}>This lesson is judged in milliseconds. Run the latency test first (⚙ Setup → Latency → Measure), or "behind the beat" may just be your speakers.</Body> : null}
        {v.results?.latencyHint ? <Body size={14} color={color.bad}>{v.results.latencyHint}</Body> : null}
        {v.results?.canHearRight ? <Button emoji="👂" label="Hear it right" onPress={() => { setMore(false); ctl.play(true); }} /> : null}
        {v.results?.helpKey ? <Button emoji="🧑‍🏫" label="Ask the coach for something different" onPress={() => { setMore(false); ctl.askHelp(); }} /> : null}
        {v.canReset ? <Button tone="plain" label="Reset this lesson" onPress={confirmReset} testID="lesson-reset" /> : null}
        <Body size={13} color={color.muted}>Keys: H hints · B band · Esc stop. Kit: hi-hat pedal × 3 or crash × 2 = yes, tom 2 × 2 = hear, floor × 2 = slower, tom 1 × 2 = faster, ride × 2 = next, crash × 4 = stop.</Body>
        <Button label="Close" onPress={() => setMore(false)} />
      </MoreSheet>

      <CoachInspector visible={coachOpen && !!v.take} kitMoves={false} take={v.take} takeExtras={{ chartId: v.take?.chart.id, lesson: v.take?.options.lesson }}
        onClose={() => setCoachOpen(false)} nextLabel={v.moves.find(m => m.id === 'skip')?.label.replace(/^⏭\s*/, '') ?? 'Next ▶'} />
    </DottedGround>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: color.ink, paddingBottom: 10, borderBottomWidth: 4, borderBottomColor: color.pop },
  titleBox: { maxWidth: 230 },
  stopChip: { backgroundColor: color.pop, borderRadius: 999, paddingHorizontal: 12, height: 34, justifyContent: 'center' },
  stopChipText: { fontWeight: '800', fontSize: 15, color: color.ink },
  body: { flex: 1, paddingTop: 16, gap: 14 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thinking: { position: 'absolute', right: 18 },
  moves: { flexDirection: 'row', gap: 16 },
  mainMove: { flex: 1.35 },
  move: { flex: 1 },
  main: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  musicPanel: { width: '100%', flexGrow: 1, flexBasis: 300, backgroundColor: color.ink, padding: 14, gap: 10, boxShadow: hardShadow(shadow.card, color.pop) },
  musicHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  musicLabel: { backgroundColor: 'transparent', paddingHorizontal: 0 },
  musicRow: { flex: 1, flexDirection: 'row', gap: 12 },
  musicPaper: { flex: 1, backgroundColor: color.cream, overflow: 'hidden' },
  musicInner: { flex: 1 },
  side: { width: 330, gap: 14 },
  bottomRow: { width: '100%', height: 168, flexDirection: 'row', gap: 18 },
  goal: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 22, backgroundColor: color.cream, borderWidth: stroke.card, borderColor: color.ink, paddingHorizontal: 22, boxShadow: hardShadow(shadow.card) },
  goalNarrow: { flex: 0.8 },
  kit: { width: 376, backgroundColor: color.ink, padding: 10, gap: 4 },
  kitTouch: { flex: 1.2, width: undefined },
  restWrap: { flex: 1, justifyContent: 'center' },
  askCoach: { gap: 2 },
});
