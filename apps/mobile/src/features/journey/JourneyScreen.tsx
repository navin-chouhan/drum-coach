// Journey, the home screen, reorganised (D10, docs/mobile/reorg/journey-after.png): one job, start the next thing.
// The coach's line (one notice at a time, with its buttons) and ⋯; Up next with its groove and three moves (kit
// gestures: hi-hat pedal × 3 or crash × 2 = Start, tom 2 × 2 = Hear it, ride × 2 = Something else; after today's set
// Beat your best or the 2-minute challenge joins as a 4th); today's set as a strip of chips with the minutes and the
// streak; the stage as a strip of dots with Full path. Everything else is in the ⋯ sheet (MoreSheet, more.ts): Just
// jam, Flow, the stage song, a new song, Ask the coach, this week's focus, Find my level, Skill map, Stick technique.
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BigMove, Body, Button, Card, Display, Label, MAX_FONT_SCALE, MoreButton, Panel, Screen, Stars, Tick, TitleBar,
  color, gesturesFor, readSettings, tabular, useKitMoves, writeSettings,
} from '../../ui';
import { getStorage } from '../../platform/storage';
import { isoWeek } from '@drum-coach/core/engine/progress';
import { getCoach, useCoachEntry, useWeekPlan } from '../coach/coach';
import { speakMoment } from '../coach/voice';
import type { LessonMode } from '../lesson/route';
import { lessonHref } from '../lesson/route';
import { playFlourish } from '../../play/flourish';
import { audio } from '../../platform/audio';
import { GroovePreview } from './GroovePreview';
import { startSessionPatch } from './source';
import { JourneyMoreSheet } from './MoreSheet';
import { afterSetMove, dotLabel, MORE_ROUTES, stageLine, type MoreEntry } from './more';
import { journeyMoments, momentKey } from './moments';
import { LinkText } from './Tiles';
import { useJourney } from './useJourney';
import { journeyNotice, sorePatch, type JourneyView } from './model';

export function JourneyScreen() {
  const [swap, setSwap] = useState(0);
  const [asks, setAsks] = useState(0); // each "Ask the coach" is a new request (the web's asks)
  const { view: v, reload, loaded } = useJourney(swap, asks);
  // "Coach automatically": once a day, a lesson for this stage when none is waiting (the web's TodayView). Never blocks
  // playing; a server that can't be reached is skipped silently here (the asks entry keeps the error, as the web).
  useEffect(() => { if (v.coachAsk) getCoach().requestLesson(v.coachAsk, undefined, reload); }, [v.coachAsk, reload]);
  const coachEntry = useCoachEntry(v.coachKey), challengeEntry = useCoachEntry(v.challengeKey);
  const writing = coachEntry?.status === 'thinking' || challengeEntry?.status === 'thinking';
  const askChallenge = () => getCoach().requestLesson(v.challengeKey, undefined, reload);
  // "Ask the coach for a different lesson": a new key each time (the web's askNew).
  const askNew = () => { getCoach().requestLesson(v.coachKey.replace(/-\d+$/, `-${asks + 1}`), undefined, reload); setAsks(a => a + 1); };
  const [more, setMore] = useState(false);
  // "why?" answers (a system alert over Journey): the kit's gestures wait until it's closed, as behind the ⋯ sheet.
  const [explaining, setExplaining] = useState(false);
  const explain = (title: string, text?: string) => { setExplaining(true); Alert.alert(title, text, [{ text: 'OK', onPress: () => setExplaining(false) }], { cancelable: true, onDismiss: () => setExplaining(false) }); };
  const habitEntry = useCoachEntry(v.week?.habit?.key ?? null);
  const askHabit = () => { const h = v.week?.habit; if (h) getCoach().requestLesson(h.key, { lessonId: 'week', step: 1, reason: h.reason, run: {} }, reload); };
  // The coach's week plan (the web's refreshWeekPlan + ensureWeekPlan): read it, ask for this week's once when you've
  // played, the coach is on and the first run is done; offline is skipped silently. A new plan re-plans the view.
  useEffect(() => { void getCoach().weekPlan.refresh(); }, []);
  useEffect(() => { if (v.weekPlanDue) getCoach().weekPlan.ensure().catch(() => {}); }, [v.weekPlanDue]);
  const plan = useWeekPlan();
  useEffect(() => { if (plan) reload(); }, [plan, reload]);
  // The ear tip shows for a minute, once a week.
  useEffect(() => {
    if (!v.hearingTipDue) return;
    const t = setTimeout(() => writeSettings(getStorage().kv, { hearingTipWeek: isoWeek(new Date()) }), 60_000);
    return () => clearTimeout(t);
  }, [v.hearingTipDue]);
  // The Monday recap: kept for this visit, given once a week (said as this visit's notice, below).
  const [recap, setRecap] = useState<string>();
  if (!recap && v.recap) setRecap(v.recap);
  useEffect(() => {
    const kv = getStorage().kv, wk = isoWeek(new Date());
    if (!recap || readSettings(kv).lastRecapWeek === wk) return;
    writeSettings(kv, { lastRecapWeek: wk }); // said out loud as this visit's notice (below)
  }, [recap]);
  // A badge earned since last time is announced once on Journey, then kept in settings.
  const [badges, setBadges] = useState<string[]>([]);
  if (v.newBadges.length && v.newBadges.join() !== badges.join()) setBadges(v.newBadges);
  useEffect(() => {
    const kv = getStorage().kv, kept = readSettings(kv).badges ?? [], add = badges.filter(id => !kept.includes(id));
    if (!add.length) return;
    writeSettings(kv, { badges: [...kept, ...add] });
    // the web's flourish(false); Journey isn't a play screen, so the engine may be suspended: start it first
    if (audio.available) audio.start().then(() => playFlourish(audio, false), () => {});
  }, [badges]);
  // New stages open (R3): said on this visit, then remembered.
  const [newStages, setNewStages] = useState(() => v.newStages);
  useEffect(() => { if (newStages) writeSettings(getStorage().kv, { newStagesSeen: true }); }, [newStages]);
  // A visit ends when Journey loses focus, as the web's TodayView unmounts on a tab change (QA3 m3): the recap, the
  // new badge and the new stages lines were said and go (the settings already remember them).
  const said = useRef(new Set<string>()); // this visit's spoken moments
  useFocusEffect(useCallback(() => () => { setRecap(undefined); setBadges([]); setNewStages(false); said.current.clear(); }, []));
  // D9: one notice at a time (the web's slim strip; the weekly recap first, then the setup nudge, the wrists check-in,
  // a badge / new stages / the health line), said whole in the title bar's coach line; its buttons before ⋯.
  // (Said out loud below.)
  const { kind, text: coachText } = journeyNotice({ coachLine: v.coachLine, recap, setupNudge: v.setupNudge, askSore: v.askSore, badges, newStages, healthLine: v.healthLine });
  // Voice first (D10): the notice, then Up next, each once per visit, once the stored data is read (so the first,
  // unloaded view isn't said). The only place Journey speaks; speakMoment gates on the settings and cleans the emoji.
  const isFocused = useIsFocused();
  const moments = journeyMoments({ kind, text: coachText }, v.hero);
  const momentsKey = moments.map(momentKey).join('¦');
  useEffect(() => {
    if (!isFocused || !loaded) return;
    for (const m of moments) {
      const k = momentKey(m);
      if (said.current.has(k)) continue;
      said.current.add(k);
      speakMoment(m);
    }
  }, [isFocused, loaded, momentsKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the key stands for the moments
  const set = (patch: Parameters<typeof writeSettings>[1]) => writeSettings(getStorage().kv, patch);
  const titleRight = (
    <View style={styles.noticeBtns}>
      {kind === 'setup' ? <>
        <Button size="small" tone="pop" label="Check my kit ▶" testID="journey-notice-setup" onPress={() => { set({ setupNudged: true }); router.navigate('/setup' as never); }} />
        <Button size="small" label="Not now" testID="journey-notice-not-now" onPress={() => set({ setupNudged: true })} />
      </> : kind === 'sore' ? <>
        <Button size="small" label="All good" testID="journey-notice-all-good" onPress={() => set({ soreAskedWeek: isoWeek(new Date()) })} />
        <Button size="small" label="A bit sore" testID="journey-notice-sore" onPress={() => set(sorePatch(v.today, isoWeek(new Date())))} />
      </> : null}
      <MoreButton label="More: Just jam, Flow, Find my level, Stick technique, your coach, Skill map" testID="journey-more-open" onPress={() => setMore(true)} />
    </View>
  );

  const open = (lessonId: string, item = -1, mode: LessonMode = 'play', role?: 'record') => {
    if (item >= 0 && mode === 'play' && v.session.date !== readSessionDate()) writeSettings(getStorage().kv, startSessionPatch(v.session));
    router.push(lessonHref(lessonId, item, mode, role) as never);
  };
  // The ⋯ sheet's and the extra moves' actions (more.ts): lessons, routes and the coach's asks.
  const run = (e: MoreEntry) => {
    const a = e.action;
    if (a.kind === 'lesson') open(a.lessonId, -1, a.mode ?? 'play', a.role);
    else if (a.kind === 'route') { if (PUSHED.some(p => a.href.startsWith(p))) router.push(a.href as never); else router.navigate(a.href as never); }
    else if (a.kind === 'askNew') askNew();
    else if (a.kind === 'askHabit') askHabit();
    else askChallenge();
  };
  const start = v.main ? () => (v.main!.challenge ? askChallenge() : open(v.main!.lessonId, v.main!.item, v.main!.label === 'Jam' ? 'jam' : 'play')) : undefined;
  const other = v.somethingElse ? () => setSwap(n => n + 1) : undefined;
  const hear = v.hero ? () => open(v.hero!.lessonId, v.hero!.item, 'hear') : undefined;
  useKitMoves({ yes: start, next: other, listen: hear }, { enabled: !more && !explaining }); // not behind the ⋯ sheet or an alert (QA3 M2)
  const fourth = afterSetMove(v);
  const doneMoves = v.pathDone ? doneTiles(v) : []; // after the whole path: the coach challenge's companions

  return (
    <Screen testID="screen-journey">
      <TitleBar title="Journey" coach={coachText} coachLines={2} right={titleRight} />

      <Card elevation={6} style={styles.next} testID="journey-next">
        {v.hero ? <Hero v={v} writing={writing} explain={explain} /> : (
          <Panel tone="pop" style={styles.nextTop}>
            <View style={styles.heroText}>
              <Display size={HERO_TITLE} testID="journey-all-done">🎉 Every stage done</Display>
              {writing ? <Body size={15} weight="700" testID="journey-coach-writing" accessibilityLiveRegion="polite">{WRITING}</Body>
                : challengeEntry?.status === 'error' ? <Body size={15} weight="700" color={color.bad} testID="journey-challenge-error">{challengeEntry.error}</Body> : null}
            </View>
          </Panel>
        )}
        <View style={styles.moves}>
          {v.main ? (
            <BigMove testID="journey-start" tone="go" emoji={v.main.emoji} label={v.main.label} gestures={gesturesFor('yes')} onPress={start}
              disabled={!!v.main.challenge && challengeEntry?.status === 'thinking'} style={styles.moveMain} />
          ) : null}
          {v.pathDone
            ? doneMoves.map(e => <BigMove key={e.key} testID={e.testID} emoji={e.emoji} label={e.title} note={e.sub} onPress={() => run(e)} style={styles.move} />)
            : <>
              <BigMove testID="journey-hear" emoji="👂" label="Hear it" gestures={gesturesFor('listen')} onPress={hear} disabled={!hear} style={styles.move} />
              <BigMove testID="journey-something-else" tone="alt" emoji="↻" label="Something else" gestures={gesturesFor('next')} onPress={other} disabled={!other} style={styles.move} />
              {fourth ? <BigMove testID={fourth.testID} emoji={fourth.emoji} label={fourth.title} note={fourth.sub} onPress={() => run(fourth)} style={styles.move} /> : null}
            </>}
        </View>
      </Card>

      <SetStrip v={v} onOpen={(id, item) => open(id, item)} />
      {v.trail ? <StageStrip v={v} onOpen={id => open(id)} /> : null}

      <JourneyMoreSheet v={v} visible={more} onClose={() => setMore(false)} onRun={run}
        coach={{ thinking: coachEntry?.status === 'thinking' || habitEntry?.status === 'thinking', error: coachEntry?.status === 'error' ? coachEntry.error : undefined }} />
    </Screen>
  );
}

const HERO_TITLE = 44;
const WRITING = '✍ Your coach is writing your next lesson… this can take a minute. You can keep playing; the answer will wait here.';
/** Routes that open over the main frame (pushed, so ‹ comes back); the sections are navigated to. */
const PUSHED = ['/lesson/', '/technique', '/song/'];
// The stored session's date, read at tap time (the view may be a render old).
const readSessionDate = () => readSettings(getStorage().kv).session?.date;

/** After the whole path: Flow, the 2-minute challenge and Beat your best as moves beside the coach challenge. */
function doneTiles(v: JourneyView): MoreEntry[] {
  const out: MoreEntry[] = [];
  if (v.flow) out.push({ key: 'flow', emoji: '🌊', title: 'Flow', sub: v.flow.sub, testID: 'journey-tile-flow', action: { kind: 'lesson', lessonId: v.flow.lessonId, mode: 'flow' } });
  if (v.arcade) out.push({ key: 'arcade', emoji: '⏱', title: '2-minute challenge', sub: v.arcade.sub, testID: 'journey-tile-arcade', action: { kind: 'lesson', lessonId: v.arcade.lessonId, mode: 'arcade' } });
  if (v.record) out.push({ key: 'record', emoji: '🏆', title: 'Beat your best', sub: v.record.title, testID: 'journey-tile-record', action: { kind: 'lesson', lessonId: v.record.lessonId, role: 'record' } });
  return out;
}

function Hero({ v, writing, explain }: { v: JourneyView; writing: boolean; explain: (title: string, text?: string) => void }) {
  const h = v.hero!;
  return (
    <Panel tone="pop" style={styles.nextTop}>
      <Text style={styles.bigIcon} accessible={false}>{h.icon}</Text>
      <View style={styles.heroText}>
        <View style={styles.kickerRow}>
          <Label style={styles.flexShrink}>{h.kicker}{h.coachWrote ? ' · ✍ your coach wrote it' : ''}</Label>
          {h.why ? <LinkText label="why this one?" size={14} testID="journey-why" onPress={() => explain('Why this one?', h.why)} /> : null}
        </View>
        <Display size={HERO_TITLE} style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">{h.title}</Display>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.step} numberOfLines={1}>{h.step} <Text style={styles.stepMeta}>· {h.meta}</Text></Text>
        <Body size={17} numberOfLines={writing ? 1 : 2} style={styles.what}>{h.what}</Body>
        {/* the web's <Thinking>, in the what's second line so the card keeps its height */}
        {writing ? <Body size={14} weight="700" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} testID="journey-coach-writing" accessibilityLiveRegion="polite">
          {WRITING}</Body> : null}
      </View>
      {h.preview ? <GroovePreview preview={h.preview} width={292} /> : null}
    </Panel>
  );
}

/** Today's set as one strip of chips (D10), with the minutes and the streak. Each chip opens its item. */
function SetStrip({ v, onOpen }: { v: JourneyView; onOpen: (lessonId: string, item: number) => void }) {
  const items = v.set.items.slice(0, 4);
  const extra = v.set.items.length - items.length;
  const streak = v.you.streak;
  const minutes = v.set.done ? 'done ✓' : `${v.set.minutesDone} / ${v.set.minutesTotal} min`;
  return (
    <Card style={styles.strip} testID="journey-set">
      <View style={styles.stripHead}>
        <Label>Today’s set</Label>
        <View style={styles.flex} />
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[styles.setMin, tabular]}
          accessibilityLabel={`${v.set.done ? 'Set done' : `${v.set.minutesDone} of ${v.set.minutesTotal} minutes`}, ${streak} day streak`}>
          {`${minutes}${streak ? ` · 🔥 ${streak}` : ''}`}
        </Text>
      </View>
      <View style={styles.chips}>
        {items.map(it => (
          <Pressable key={it.index} testID={`journey-set-${it.index}`} onPress={() => onOpen(it.lessonId, it.index)} accessibilityRole="button"
            accessibilityLabel={`${it.title}${it.detail ? `, ${it.detail}` : ''}, ${it.state === 'done' ? 'done' : it.state === 'current' ? 'up next' : 'to do'}${it.value ? `, ${it.value}` : ''}`}
            style={({ pressed }) => [styles.chip, it.state === 'done' && styles.chipDone, it.state === 'current' && styles.chipNow, pressed && styles.pressed]}>
            <Tick state={it.state} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={styles.chipText}>{it.title}</Text>
            {it.stars ? <Stars n={it.stars} size={13} /> : null}
          </Pressable>
        ))}
        {extra > 0 ? <Body size={15} weight="800" color={color.muted}>{`+${extra}`}</Body> : null}
      </View>
    </Card>
  );
}

/** The stage as a strip of dots (D10: the names are on Full path), its one line and Full path. A dot opens its lesson. */
function StageStrip({ v, onOpen }: { v: JourneyView; onOpen: (lessonId: string) => void }) {
  const t = v.trail!;
  return (
    <Card style={styles.strip} testID="journey-trail">
      <View style={styles.stripHead}>
        <Label>{t.title}</Label>
        <Body size={15} weight="700" numberOfLines={1} style={styles.flexShrink}>{stageLine(v)}</Body>
        <View style={styles.flex} />
        <Button size="small" label="Full path" trailing={<Text style={styles.chev}>›</Text>} testID="journey-full-path" onPress={() => router.navigate(MORE_ROUTES.path as never)} />
      </View>
      <View style={styles.dots}>
        {t.stops.map(s => (
          <Pressable key={s.id} testID={`journey-dot-${s.id}`} disabled={!s.lessonId} onPress={() => { if (s.lessonId) onOpen(s.lessonId); }}
            accessibilityRole="button" accessibilityLabel={dotLabel(s)} hitSlop={10}
            style={[styles.dot, s.state === 'done' && styles.dotDone, s.state === 'now' && styles.dotNow, s.state === 'todo' && (s.flag === 'checkpoint' || s.started) && styles.dotDashed]}>
            {s.flag === 'checkpoint' ? <Text style={styles.dotMark}>★</Text> : s.flag === 'coach' ? <Text style={styles.dotMark}>✍</Text> : null}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  noticeBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  next: { paddingTop: 18, paddingHorizontal: 18, paddingBottom: 18, gap: 18 },
  nextTop: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 18, paddingHorizontal: 18 },
  bigIcon: { fontSize: 72, lineHeight: 80 },
  heroText: { flex: 1, minWidth: 0 },
  heroTitle: { marginTop: 8, marginBottom: 6 },
  step: { fontSize: 19, fontWeight: '800', color: color.ink },
  stepMeta: { fontWeight: '600' },
  what: { marginTop: 4 },
  moves: { flexDirection: 'row', gap: 16, minHeight: 118 },
  moveMain: { flex: 2.2, minWidth: 0 },
  move: { flex: 1, minWidth: 0 },
  strip: { marginTop: 18, paddingVertical: 12, paddingHorizontal: 16, gap: 10 },
  stripHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 38 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 12, borderWidth: 2.5, borderColor: color.ink, backgroundColor: color.panel, minWidth: 0 },
  chipDone: { backgroundColor: '#E3F5EA' },
  chipNow: { backgroundColor: color.pop },
  chipText: { fontSize: 15, fontWeight: '800', color: color.ink, flexShrink: 1 },
  pressed: { opacity: 0.7 },
  setMin: { fontSize: 17, fontWeight: '900', color: color.ink },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 44 },
  dot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2.5, borderColor: color.ink, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: color.good },
  dotNow: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.pop },
  dotDashed: { borderStyle: 'dashed' },
  dotMark: { fontSize: 14, fontWeight: '900', color: color.ink },
  chev: { fontSize: 18, fontWeight: '700', color: color.ink },
});
