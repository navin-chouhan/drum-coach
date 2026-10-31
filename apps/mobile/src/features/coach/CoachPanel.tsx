// The coach panel (mockups coach, coach-offline): a black head, the dotted body with comic bubbles, and the composer.
// <CoachPanel/> is the column; <CoachInspector/> slides it over the right side of the screen you're on (A7b mounts it
// on the results, so the moves and notes stay in view). One remembering conversation (session.ts) feeds both.
import type { Feedback } from '@drum-coach/core/coach/schemas';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkCapabilities } from '../../platform/capabilities';
import type { Capabilities } from '../../platform/contracts';
import {
  Body, Button, Display, DottedGround, GestureChip, KeepsWorkingCard, Mascot, MAX_FONT_SCALE, OfflineCard, Pill, SpeechBubble, color, font,
  gesturesFor, hardShadow, useAppSettings, useKitMoves,
} from '../../ui';
import { drillRoute, getCoach, useCoachEntry, useCoachSession } from './coach';
import { askFeedback, feedbackKey, feedbackView, type DrillTarget } from './feedback';
import { composerNote, headerStatus, panelItems, THINKING, type PanelItem } from './panel';
import { KEEPS_WORKING, type CoachProblem } from './problem';
import type { Action, SessionTake } from './session';
import { summarizeTake, type TakeExtras } from './summary';

export const PANEL_WIDTH = 440;
/** How often the panel checks whether the coach is back while a question waits. */
const CHECK_BACK_MS = 20_000;

export type CoachPanelProps = {
  /** The take on screen: its feedback card ("Detailed feedback and a drill") shows first. */
  take?: SessionTake;
  takeExtras?: TakeExtras;
  /** Shows ✕ in the head. */
  onClose?: () => void;
  /** Kit gestures drive the next step (hi-hat pedal × 3 / crash × 2 = yes). Off when the host screen owns the kit. */
  kitMoves?: boolean;
  /** The label "next" gets on this screen (the coach can't name steps that don't exist). */
  nextLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function CoachPanel({ take, takeExtras, onClose, kitMoves = true, nextLabel = 'Next ▶', style, testID = 'coach-panel' }: CoachPanelProps) {
  const coach = getCoach();
  const s = useCoachSession();
  const settings = useAppSettings();
  const [server, setServer] = useState<Capabilities['coachServer']>('unknown');
  const scroll = useRef<ScrollViewInstance>(null);

  // The server's status for the head, now and when the app comes back; a waiting question goes when it answers.
  useEffect(() => {
    let live = true;
    const check = () => {
      void checkCapabilities().then(c => { if (live) setServer(c.coachServer); }).catch(() => {});
      if (s.queued || s.problem?.canQueue) void coach.session.checkBack();
    };
    check();
    coach.refreshLessons();
    const sub = AppState.addEventListener('change', st => { if (st === 'active') check(); });
    const t = s.queued || s.problem?.canQueue ? setInterval(check, CHECK_BACK_MS) : undefined;
    return () => { live = false; sub.remove(); if (t) clearInterval(t); };
  }, [coach, s.queued, s.problem?.canQueue]); // eslint-disable-line react-hooks/exhaustive-deps

  const raw = s.reply?.action;
  const nextStep = raw && !raw.now ? coach.session.screenAction(raw, nextLabel) : undefined;
  const runnable = nextStep && coach.session.canRunAction(nextStep) ? nextStep : undefined;
  const items = useMemo(() => panelItems(s, { nextStep: runnable }), [s, runnable]);
  const head = headerStatus(s, server);

  useKitMoves({ yes: () => (runnable ? coach.session.runAction(runnable) : coach.session.padAction('yes')) }, { enabled: kitMoves });

  const ctx = take && s.thread.findLast(t => t.who === 'ctx')?.text;
  return (
    <View testID={testID} style={[styles.panel, style]}>
      <Head status={head} onClose={onClose} />
      <DottedGround style={styles.body}>
        <ScrollView ref={scroll} contentContainerStyle={styles.thread} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          accessibilityLabel="Your conversation with the coach">
          {take && !ctx ? <Ctx text={`${take.chart.title} · ${Math.round(take.chart.bpm * take.options.speed)} BPM`} /> : null}
          {take ? <TakeFeedback take={take} extras={takeExtras} /> : null}
          {!take && !items.length ? <Empty liveCoach={settings.liveCoach} /> : null}
          {items.map(i => <Item key={i.key} item={i} />)}
        </ScrollView>
      </DottedGround>
      <Composer liveCoach={settings.liveCoach} problem={s.problem} queued={s.queued} thinking={s.status === 'thinking'} />
    </View>
  );
}

/** The panel over the right side of the screen you're on. */
export function CoachInspector({ visible, ...props }: CoachPanelProps & { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.inspector} accessibilityViewIsModal testID="coach-inspector">
      <CoachPanel {...props} style={styles.inspectorPanel} />
    </View>
  );
}

function Head({ status, onClose }: { status: ReturnType<typeof headerStatus>; onClose?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.head, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
      <Mascot size="sm" />
      <Display size={24} color={color.white} accessibilityRole="header">💬 Coach</Display>
      <Pill tone={status.tone} style={styles.headPill}>{status.text}</Pill>
      <View style={styles.flex} />
      {onClose ? (
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the coach" testID="coach-close"
          style={({ pressed }) => [styles.round, styles.close, pressed && styles.pressed]}>
          <Text style={styles.roundText}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Ctx({ text }: { text: string }) {
  return <View style={styles.ctx}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.ctxText}>{text}</Text></View>;
}

function Item({ item }: { item: PanelItem }) {
  switch (item.kind) {
    case 'ctx': return <Ctx text={item.text} />;
    case 'coach': return <SpeechBubble testID="coach-reply">{item.text}</SpeechBubble>;
    case 'app': return <SpeechBubble grey testID="coach-app-verdict"><Text style={styles.bold}>From the app: </Text>{item.text}</SpeechBubble>;
    case 'streaming': return <SpeechBubble testID="coach-streaming">{item.text} …</SpeechBubble>;
    case 'me': return <Me text={item.text} sub={item.sub} waiting={item.waiting} />;
    case 'next': return <NextStep action={item.action} />;
    case 'thinking': return <Thinking />;
    case 'problem': return <ProblemCard problem={item.problem} />;
    case 'keepsWorking': return <KeepsWorking />;
  }
}

function Me({ text, sub, waiting }: { text: string; sub?: string; waiting: boolean }) {
  return (
    <View style={[styles.msg, styles.me]} testID={waiting ? 'coach-queued' : 'coach-me'}>
      <View style={[styles.meBubble, waiting && styles.meWaiting]}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.meText, waiting && styles.meWaitingText]}>{text}</Text>
        {sub ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.meSub, waiting && styles.meWaitingText]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** The suggested next step: one big button, with "yes" from the kit. */
function NextStep({ action }: { action: Action }) {
  const emoji = { again: '↻', slower: '🐢', faster: '▶', next: '⏭', drill: '▶', zoom: '🔍', trade: '🔁', count: '🗣', layers: '🧱', listen: '👂' }[action.kind];
  return (
    <Pressable testID="coach-next-step" onPress={() => getCoach().session.runAction(action)}
      accessibilityRole="button" accessibilityLabel={`${action.label}. From the kit: hi-hat pedal three times, or crash twice, or type yes`}
      style={({ pressed }) => [styles.indent, styles.next, pressed && styles.pressed]}>
      <Display size={24} color={color.white}>{emoji} {action.label}</Display>
      <View style={styles.gestures}>
        {gesturesFor('yes').map(g => <GestureChip key={g.pad} gesture={g} onTint />)}
        <Text style={styles.gestureOr}>or type “yes”</Text>
      </View>
    </Pressable>
  );
}

function Thinking({ title = THINKING.title }: { title?: string }) {
  return (
    <View style={[styles.indent, styles.think]} accessibilityRole="progressbar" accessibilityLabel={`${title} ${THINKING.line}`} testID="coach-thinking">
      <ActivityIndicator color={color.ink} />
      <View style={styles.flexShrink}>
        <Display size={15}>{title}</Display>
        <Body size={13.5}>{THINKING.line}</Body>
      </View>
    </View>
  );
}

/** What failed, Try again and Coach settings (mockup coach-offline). */
export function ProblemCard({ problem, onRetry }: { problem: CoachProblem; onRetry?: () => void }) {
  const retry = onRetry ?? (() => void getCoach().session.retry());
  const settingsBtn = <Button size="small" label="Coach settings" testID="coach-settings" onPress={() => router.navigate('/setup' as never)} />;
  return (
    <OfflineCard title={problem.title} lines={problem.lines} host={problem.host}>
      {problem.settingsFirst ? settingsBtn : null}
      <Button size="small" tone={problem.settingsFirst ? 'white' : 'pop'} emoji="↻" label="Try again" testID="coach-retry" onPress={retry} />
      {problem.settingsFirst ? null : settingsBtn}
    </OfflineCard>
  );
}

const KeepsWorking = () => <KeepsWorkingCard items={KEEPS_WORKING} />;

function Empty({ liveCoach }: { liveCoach: boolean }) {
  return (
    <SpeechBubble>
      {liveCoach
        ? 'After each take I listen back and tell you one thing, with the next step. Ask me anything here, between takes or while you play.'
        : '“The coach follows my practice” is off in Setup → Coach. Turn it on and I react to your takes.'}
    </SpeechBubble>
  );
}

/** The take's detailed feedback and a drill (src/coach/CoachFeedback.tsx). */
export function TakeFeedback({ take, extras }: { take: SessionTake; extras?: TakeExtras }) {
  const coach = getCoach();
  const key = feedbackKey(take.startedAt);
  const e = useCoachEntry<Feedback>(key);
  const v = feedbackView(e, coach.exists);
  const summary = useMemo(() => summarizeTake(take, extras), [take, extras]);
  const ask = () => void askFeedback(coach.asks, take.startedAt, summary, e?.status === 'error');
  useEffect(() => { if (e?.status === 'done' && e.data) coach.speakOnce(key, e.data); }, [coach, key, e?.status, e?.data]);

  if (v.state === 'ask') return <View style={styles.indent}><Button emoji="🥁" label="Detailed feedback and a drill" testID="coach-ask-feedback" onPress={ask} /></View>;
  if (v.state === 'thinking') return <Thinking title="The coach is listening back…" />;
  if (v.state === 'error') {
    const p = e?.problem;
    return p ? <ProblemCard problem={p} onRetry={ask} /> : <View style={styles.indent}><Body>{v.error}</Body><Button size="small" emoji="↻" label="Try again" onPress={ask} /></View>;
  }
  const play = (t: DrillTarget) => {
    const id = 'chart' in t ? coach.charts.save(t.chart).id : t.chartId;
    router.push(drillRoute({ chartId: id, bpm: t.bpm }) as never);
  };
  return (
    <>
      <SpeechBubble testID="coach-feedback">{v.feedback}</SpeechBubble>
      <View style={[styles.indent, styles.drill]} testID="coach-drill">
        <Text style={styles.kicker}>{v.kicker}</Text>
        <Display size={17}>{v.drill.title}</Display>
        <Body size={14}>{v.drill.instructions}</Body>
        {v.target ? <Button size="small" emoji="▶" label="Play this drill" testID="coach-play-drill" onPress={() => play(v.target!)} /> : null}
        {v.cached ? <Body size={12} color={color.muted}>(saved answer)</Body> : null}
      </View>
    </>
  );
}

function Composer({ liveCoach, problem, queued, thinking }: { liveCoach: boolean; problem?: CoachProblem; queued?: string; thinking: boolean }) {
  const [text, setText] = useState('');
  const insets = useSafeAreaInsets();
  const send = () => {
    const t = text.trim();
    if (!t || !liveCoach) return;
    setText('');
    void getCoach().session.say(t);
  };
  const note = composerNote({ liveCoach, problem, queued });
  return (
    <View style={[styles.comp, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
      {note ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.compNote}>{note}</Text> : null}
      <View style={styles.row}>
        <TextInput
          testID="coach-input" value={text} onChangeText={setText} onSubmitEditing={send} returnKeyType="send" blurOnSubmit={false}
          placeholder="Ask your coach" placeholderTextColor={color.muted} maxLength={2000} editable={liveCoach}
          accessibilityLabel="Ask your coach" style={styles.field} maxFontSizeMultiplier={MAX_FONT_SCALE}
        />
        <Pressable disabled accessibilityRole="button" accessibilityLabel="Talk to the coach: needs speech-to-text on the iPad, coming later"
          accessibilityState={{ disabled: true }} style={[styles.round, styles.dim]} testID="coach-mic">
          <Text style={styles.roundText}>🎙️</Text>
        </Pressable>
        <Pressable onPress={send} disabled={!text.trim() || !liveCoach} accessibilityRole="button" accessibilityLabel={thinking ? 'Send (after the answer on its way)' : 'Send'}
          accessibilityState={{ disabled: !text.trim() || !liveCoach }} testID="coach-send"
          style={({ pressed }) => [styles.round, styles.send, (!text.trim() || !liveCoach) && styles.dim, pressed && styles.pressed]}>
          <Text style={[styles.roundText, styles.sendText]}>➤</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  dim: { opacity: 0.45 },
  pressed: { transform: [{ translateX: 2 }, { translateY: 2 }] },
  bold: { fontWeight: '900' },
  panel: { width: PANEL_WIDTH, borderLeftWidth: 4, borderColor: color.ink, backgroundColor: color.ground, overflow: 'hidden' },
  inspector: { position: 'absolute', top: 0, bottom: 0, right: 0, zIndex: 10 },
  inspectorPanel: { flex: 1, boxShadow: `-8px 0px 0px 0px ${color.pop}` },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 16, paddingLeft: 18, paddingBottom: 12, backgroundColor: color.night, borderBottomWidth: 3, borderColor: color.ink, boxShadow: `0px 4px 0px 0px ${color.pop}`, zIndex: 1 },
  headPill: { marginLeft: 4 },
  round: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, borderColor: color.ink, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0px 0px rgba(255,255,255,0.53)' },
  close: { width: 44, height: 44 },
  roundText: { fontSize: 18, fontWeight: '900', color: color.ink },
  send: { backgroundColor: color.pop },
  sendText: { fontSize: 20 },
  body: { flex: 1 },
  thread: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 12, paddingBottom: 14, paddingHorizontal: 16, gap: 11 },
  ctx: { alignSelf: 'center', backgroundColor: color.panel, borderWidth: 2, borderColor: color.ink, paddingVertical: 2, paddingHorizontal: 10, borderRadius: 999 },
  ctxText: { fontSize: 12.5, fontWeight: '800', color: color.ink },
  msg: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  me: { justifyContent: 'flex-end' },
  meBubble: { maxWidth: 350, backgroundColor: color.blue, borderWidth: 3, borderColor: color.ink, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 4, paddingVertical: 9, paddingHorizontal: 13, boxShadow: hardShadow(4) },
  meText: { fontSize: 15.5, fontWeight: '700', lineHeight: 21, color: color.white },
  meSub: { fontSize: 11.5, fontWeight: '700', color: color.white, opacity: 0.85, marginTop: 3 },
  meWaiting: { backgroundColor: color.cream, borderStyle: 'dashed' },
  meWaitingText: { color: color.ink },
  indent: { marginLeft: 44, gap: 6 },
  drill: { backgroundColor: color.cream, borderWidth: 3, borderColor: color.ink, boxShadow: hardShadow(4), paddingVertical: 10, paddingHorizontal: 12, gap: 5 },
  kicker: { ...font.display, fontSize: 11.5, letterSpacing: 0.7, textTransform: 'uppercase', color: color.muted },
  next: { backgroundColor: color.blue, borderWidth: 3, borderColor: color.ink, boxShadow: hardShadow(5), paddingVertical: 10, paddingHorizontal: 14, gap: 8, minHeight: 44 },
  gestures: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  gestureOr: { fontSize: 13, fontWeight: '700', color: color.white },
  think: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: color.cream, borderWidth: 3, borderStyle: 'dashed', borderColor: color.ink, paddingVertical: 9, paddingHorizontal: 12 },
  comp: { paddingTop: 12, paddingHorizontal: 14, gap: 8, backgroundColor: color.night, borderTopWidth: 3, borderColor: color.ink },
  compNote: { fontSize: 13, fontWeight: '600', color: color.pop },
  field: { flex: 1, height: 46, borderRadius: 999, borderWidth: 3, borderColor: color.ink, backgroundColor: color.panel, paddingHorizontal: 16, fontSize: 16, fontWeight: '600', color: color.ink },
});
