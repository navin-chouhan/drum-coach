// Journey, the home screen (docs/mockups/ipad/journey.html, png/journey.png): the coach's line; Up next with its
// groove and four moves (kit gestures: hi-hat pedal × 3 or crash × 2 = Start, ride × 2 = Something else, tom 2 × 2 =
// Hear it); You, Today's set and the stage song in one row; the stage trail, with "Find my level" (the web's placement
// link under the path, there whether or not the first run's test was taken) and Full path. One screen, no scrolling.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  BigMove, Body, Button, Card, CoachLine, Display, Label, ListRow, Panel, Ring, Screen, Stars, StatTile, Tick, TitleBar, Trail,
  color, gesturesFor, ratio, readSettings, tabular, type, useKitMoves, writeSettings,
} from '../../ui';
import { getStorage } from '../../platform/storage';
import { isoWeek } from '@drum-coach/core/engine/progress';
import { getCoach, useCoachEntry, useWeekPlan } from '../coach/coach';
import { speakMoment } from '../coach/voice';
import type { LessonMode } from '../lesson/route';
import { lessonHref } from '../lesson/route';
import { playFlourish } from '../../play/flourish';
import { songHref } from '../songs/songsModel';
import { audio } from '../../platform/audio';
import { GroovePreview } from './GroovePreview';
import { startSessionPatch } from './source';
import { MoreSheet } from './MoreSheet';
import { LinkText, Tile } from './Tiles';
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
  // "why?" answers (a system alert over Journey): the kit's gestures wait until it's closed, as behind the More sheet.
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
  // The Monday recap: kept for this visit, given once a week, spoken if the voice is on.
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
  useFocusEffect(useCallback(() => () => { setRecap(undefined); setBadges([]); setNewStages(false); }, []));
  // D9: one notice at a time (the web's slim strip; the weekly recap first, then the setup nudge, the wrists check-in,
  // a badge / new stages / the health line), said whole in the title bar's coach line (three fitted lines, QA3 M1);
  // its buttons in the bar's right slot.
  const { kind, text: coachText } = journeyNotice({ coachLine: v.coachLine, recap, setupNudge: v.setupNudge, askSore: v.askSore, badges, newStages, healthLine: v.healthLine });
  // Voice first (D10): once per visit, the notice in the bar out loud, or else the Up next line.
  const spoke = useRef(false);
  useFocusEffect(useCallback(() => () => { spoke.current = false; }, []));
  useEffect(() => {
    if (spoke.current || !loaded) return;
    spoke.current = true;
    if (kind) speakMoment({ kind: 'notice', text: coachText });
    else if (v.hero) speakMoment({ kind: 'upNext', title: v.hero.title, step: v.hero.step });
  });
  const set = (patch: Parameters<typeof writeSettings>[1]) => writeSettings(getStorage().kv, patch);
  const titleRight = kind === 'setup' ? <View style={styles.noticeBtns}>
      <Button size="small" tone="pop" label="Check my kit ▶" testID="journey-notice-setup" onPress={() => { set({ setupNudged: true }); router.navigate('/setup' as never); }} />
      <Button size="small" label="Not now" testID="journey-notice-not-now" onPress={() => set({ setupNudged: true })} />
    </View>
    : kind === 'sore' ? <View style={styles.noticeBtns}>
      <Button size="small" label="All good" testID="journey-notice-all-good" onPress={() => set({ soreAskedWeek: isoWeek(new Date()) })} />
      <Button size="small" label="A bit sore" testID="journey-notice-sore" onPress={() => set(sorePatch(v.today, isoWeek(new Date())))} />
    </View>
    : v.setupDue
      ? <Button size="small" emoji="🛠" label="Check my kit" testID="journey-check-kit" onPress={() => router.navigate('/setup' as never)} />
      : <Button size="small" emoji="🗺️" label="Skill map" testID="journey-skill-map" onPress={() => router.navigate('/progress?view=skills' as never)} />;

  const open = (lessonId: string, item = -1, mode: LessonMode = 'play', role?: 'record') => {
    if (item >= 0 && mode === 'play' && v.session.date !== readSessionDate()) writeSettings(getStorage().kv, startSessionPatch(v.session));
    router.push(lessonHref(lessonId, item, mode, role) as never);
  };
  const start = v.main ? () => (v.main!.challenge ? askChallenge() : open(v.main!.lessonId, v.main!.item, v.main!.label === 'Jam' ? 'jam' : 'play')) : undefined;
  const other = v.somethingElse ? () => setSwap(n => n + 1) : undefined;
  const hear = v.hero ? () => open(v.hero!.lessonId, v.hero!.item, 'hear') : undefined;
  useKitMoves({ yes: start, next: other, listen: hear }, { enabled: !more && !explaining }); // not behind the More sheet or an alert (QA3 M2)

  return (
    <Screen testID="screen-journey">
      <TitleBar
        title="Journey"
        coach={coachText}
        coachLines={3}
        right={titleRight}
      />

      <Card elevation={6} style={styles.next} testID="journey-next">
        {v.hero ? <Hero v={v} writing={writing} explain={explain} /> : (
          <Panel tone="pop" style={styles.nextTop}>
            <View style={styles.heroText}>
              <Display size={type.hero}>🎉 Every stage done</Display>
              {writing ? <Body size={13} weight="700" testID="journey-coach-writing" accessibilityLiveRegion="polite">{WRITING}</Body>
                : challengeEntry?.status === 'error' ? <Body size={13} weight="700" color={color.bad} testID="journey-challenge-error">{challengeEntry.error}</Body> : null}
            </View>
          </Panel>
        )}
        <View style={styles.moves}>
          {v.main ? (
            <BigMove testID="journey-start" tone="go" emoji={v.main.emoji} label={v.main.label} gestures={gesturesFor('yes')} onPress={start} style={styles.moveMain} />
          ) : null}
          <BigMove testID="journey-something-else" emoji="↻" label="Something else" gestures={gesturesFor('next')} onPress={other} disabled={!other} style={styles.move} />
          {v.afterSet && v.arcade /* after today's set, as the web: the 2-minute challenge and Beat your best join the moves */
            ? <BigMove testID="journey-arcade" emoji="⏱" label="2-minute challenge" note={v.arcade.goal} onPress={() => open(v.arcade!.lessonId, -1, 'arcade')} style={styles.move} />
            : <BigMove testID="journey-hear" emoji="👂" label="Hear it" gestures={gesturesFor('listen')} onPress={hear} disabled={!hear} style={styles.move} />}
          {v.afterSet && v.record
            ? <BigMove testID="journey-record" emoji="🏆" label="Beat your best" note={v.record.goal} onPress={() => open(v.record!.lessonId, -1, 'play', 'record')} style={styles.move} />
            : <BigMove testID="journey-jam" emoji="🎸" label="Just jam" note="no score, with the band" disabled={!v.jamLessonId}
              onPress={v.jamLessonId ? () => open(v.jamLessonId!, -1, 'jam') : undefined} style={styles.move} />}
        </View>
      </Card>

      <View style={styles.rowB}>
        <You v={v} habit={habitEntry?.status} onHabit={askHabit} explain={explain} />
        <TodaysSet v={v} onOpen={(id, item) => open(id, item)} />
        <StageSong v={v} onHear={id => open(id, -1, 'hear')} onPlay={id => open(id)} />
      </View>

      {v.pathDone ? (
        <Card style={styles.trail} testID="journey-all-done">
          <View style={styles.trailHead}>
            <Label>All stages done</Label>
            <View style={styles.flex} />
            <Button tone="plain" size="small" label="⋯ More" testID="journey-more-open" accessibilityLabel="More ways to play" onPress={() => setMore(true)} />
          </View>
          <View style={styles.tiles}>{doneTiles(v, {
            challenge: { status: challengeEntry?.status, error: challengeEntry?.status === 'error' ? challengeEntry.error : undefined, ask: askChallenge },
            open,
          }).map(({ key, ...t }) => <Tile key={key} compact style={styles.tileCell} {...t} />)}
          </View>
        </Card>
      ) : null}

      {v.trail ? (
        <Card style={styles.trail} testID="journey-trail">
          <View style={styles.trailHead}>
            <Label>{v.trail.title}</Label>
            <Body size={13} weight="700" numberOfLines={1} style={styles.flexShrink}>{v.trail.summary}</Body>
            <View style={styles.flex} />
            <Button tone="plain" size="small" label="⋯ More" testID="journey-more-open" accessibilityLabel="More ways to play and your coach's lessons" onPress={() => setMore(true)} />
            <Button tone="plain" size="small" label="Find my level" testID="journey-find-level" accessibilityLabel="Find my level (a short placement test)"
              onPress={() => router.push('/lesson/placement' as never)} />
            <Button tone="plain" size="small" label="Full path" trailing={<Text style={styles.chev}>›</Text>} onPress={() => router.navigate('/progress?view=path' as never)} />
          </View>
          <Trail stops={v.trail.stops} onOpen={id => { const s = v.trail!.stops.find(x => x.id === id); if (s?.lessonId) open(s.lessonId); }} />
        </Card>
      ) : null}
      <MoreSheet v={v} visible={more} onClose={() => setMore(false)} onOpen={id => open(id)} onFlow={() => v.flow && open(v.flow.lessonId, -1, 'flow')} onAskNew={askNew}
        coach={{ thinking: coachEntry?.status === 'thinking', error: coachEntry?.status === 'error' ? coachEntry.error : undefined }} />
    </Screen>
  );
}

// The stored session's date, read at tap time (the view may be a render old).
const WRITING = '✍ Your coach is writing your next lesson… this can take a minute. You can keep playing; the answer will wait here.';
type DoneTile = { key: string; emoji: string; title: string; sub?: string; testID: string; tone?: 'pop'; onPress?: () => void };
/** The All stages done tiles (the web's setTiles), at most two rows of four: show-off songs past that fold into one. */
function doneTiles(v: JourneyView, d: {
  challenge: { status?: string; error?: string; ask: () => void };
  open: (lessonId: string, item?: number, mode?: LessonMode, role?: 'record') => void;
}): DoneTile[] {
  const c = d.challenge;
  const fixed: DoneTile[] = [
    { key: 'challenge', tone: 'pop', emoji: '🎯', title: 'Coach challenge', testID: 'journey-tile-challenge',
      sub: v.challenge ? v.challenge.title : c.status === 'thinking' ? 'your coach is writing it…' : c.error ?? 'a review or stretch lesson aimed at your weakest spot',
      onPress: c.status === 'thinking' ? undefined : () => (v.challenge ? d.open(v.challenge.lessonId) : c.ask()) },
    ...(v.flow ? [{ key: 'flow', emoji: '🌊', title: 'Flow', sub: v.flow.sub, testID: 'journey-tile-flow', onPress: () => d.open(v.flow!.lessonId, -1, 'flow') }] : []),
    ...(v.arcade ? [{ key: 'arcade', emoji: '⏱', title: '2-minute challenge', sub: v.arcade.sub, testID: 'journey-tile-arcade', onPress: () => d.open(v.arcade!.lessonId, -1, 'arcade') }] : []),
    ...(v.record ? [{ key: 'record', emoji: '🏆', title: 'Beat your best', sub: v.record.title, testID: 'journey-tile-record', onPress: () => d.open(v.record!.lessonId, -1, 'play', 'record') }] : []),
    { key: 'song', emoji: '🎵', title: 'Learn a new song', sub: 'from YouTube, a few bars at a time', testID: 'journey-tile-song', onPress: () => router.navigate('/songs' as never) },
  ];
  const room = 8 - fixed.length, songs = v.showoff;
  const shown = songs.length > room ? songs.slice(0, room - 1) : songs;
  return [
    ...fixed,
    ...shown.map(x => ({ key: `showoff-${x.id}`, emoji: '🎤', title: `Show-off: ${x.title}`, sub: 'Stage mode is under Play', testID: `journey-tile-showoff-${x.id}`,
      onPress: () => router.push(songHref(x.id) as never) })),
    ...(songs.length > shown.length ? [{ key: 'showoff-more', emoji: '🎤', title: 'Show-off set', sub: `+${songs.length - shown.length} more, on Progress`, testID: 'journey-tile-showoff-more',
      onPress: () => router.navigate('/progress' as never) }] : []),
  ];
}

const readSessionDate = () => readSettings(getStorage().kv).session?.date;

function Hero({ v, writing, explain }: { v: JourneyView; writing: boolean; explain: (title: string, text?: string) => void }) {
  const h = v.hero!;
  return (
    <Panel tone="pop" style={styles.nextTop}>
      <Text style={styles.bigIcon} accessible={false}>{h.icon}</Text>
      <View style={styles.heroText}>
        <View style={styles.kickerRow}>
          <Label style={styles.flexShrink}>{h.kicker}{h.coachWrote ? ' · ✍ your coach wrote it' : ''}</Label>
          {h.why ? <LinkText label="why this one?" testID="journey-why" onPress={() => explain('Why this one?', h.why)} /> : null}
        </View>
        <Display size={type.hero} style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} accessibilityRole="header">{h.title}</Display>
        <Text style={styles.step} numberOfLines={1}>{h.step} <Text style={styles.stepMeta}>· {h.meta}</Text></Text>
        <Body size={15} numberOfLines={writing ? 1 : 2} style={styles.what}>{h.what}</Body>
        {/* the web's <Thinking>, in the what's second line so the card keeps its height */}
        {writing ? <Body size={13} weight="700" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} testID="journey-coach-writing" accessibilityLiveRegion="polite">
          {WRITING}</Body> : null}
      </View>
      {h.preview ? <GroovePreview preview={h.preview} /> : <View style={styles.previewSpace} />}
    </Panel>
  );
}

function You({ v, habit, onHabit, explain }: { v: JourneyView; habit?: string; onHabit: () => void; explain: (title: string, text?: string) => void }) {
  const y = v.you;
  return (
    <Card style={[styles.colYou, styles.you]} testID="journey-you">
      <View style={styles.youTop}>
        {y.ring ? <Ring fraction={y.ring.fraction} value={y.ring.value} caption={y.ring.caption}
          accessibilityLabel={`${y.ring.caption}: ${y.ring.value} lessons done`} /> : null}
        <View style={styles.flexShrink}>
          <Label>Your rank</Label>
          <Display size={type.rank} style={styles.rank} numberOfLines={1} adjustsFontSizeToFit>{y.rank}{y.proven ? ' ✓' : ''}</Display>
          {y.nextRank ? <Body size={13} numberOfLines={2}>Next rank: <Text style={styles.b}>{y.nextRank}</Text></Body> : null}
        </View>
      </View>
      <View style={styles.three}>
        <StatTile value={String(y.streak)} label="day streak" style={styles.tile} />
        <StatTile value={y.landedPct === null ? '–' : `${y.landedPct}%`} label="landed" style={styles.tile} />
        <StatTile value={String(y.minutesToday)} unit={`/${y.minutesGoal}`} label="min today" style={styles.tile} />
      </View>
      {v.week ? (
        <View style={styles.week} testID="journey-week">
          <Body size={13} numberOfLines={2} style={styles.flexShrink}>🎯 This week: <Text style={styles.b}>{v.week.words}</Text></Body>
          {v.week.why ? <LinkText label="why?" accessibilityLabel="Why this week's focus" onPress={() => explain('This week', v.week!.why)} /> : null}
          {v.week.habit ? (habit === 'thinking' ? <Body size={12} color={color.muted} numberOfLines={1}>your coach is on it…</Body>
            : habit === 'done' ? <Body size={12} color={color.muted} numberOfLines={1}>lesson ready on your trail</Body>
            : <LinkText label="lesson for this" size={12} testID="journey-week-lesson" onPress={onHabit} />) : null}
        </View>
      ) : null}
    </Card>
  );
}

function TodaysSet({ v, onOpen }: { v: JourneyView; onOpen: (lessonId: string, item: number) => void }) {
  const total = v.set.minutesTotal || 1;
  const items = v.set.items.slice(0, 4);
  return (
    <Card style={styles.colSet} testID="journey-set">
      <View style={styles.setHead}>
        <Label>Today’s set</Label>
        <Text style={[styles.setMin, tabular]}>{v.set.done ? 'done ✓' : `${v.set.minutesDone} of ${v.set.minutesTotal} min`}</Text>
      </View>
      <View style={styles.bar} accessible accessibilityLabel={`${v.set.minutesDone} of ${v.set.minutesTotal} minutes done`}>
        {v.set.items.map(it => {
          const minutes = v.session.items[it.index]?.minutes ?? 0;
          if (it.state === 'todo') return null;
          return <View key={it.index} style={[styles.barSeg, { width: `${(minutes / total) * 100}%`, backgroundColor: it.state === 'done' ? color.good : color.pop }]} />;
        })}
      </View>
      {items.map((it, k) => (
        <ListRow key={it.index} first={k === 0} compact bold={it.state === 'current'}
          lead={<Tick state={it.state} />} title={it.title} detail={it.detail}
          value={it.stars ? <Stars n={it.stars} /> : it.value}
          onPress={() => onOpen(it.lessonId, it.index)}
          accessibilityLabel={`${it.title}${it.detail ? `, ${it.detail}` : ''}, ${it.state === 'done' ? 'done' : it.state === 'current' ? 'up next' : 'to do'}${it.value ? `, ${it.value}` : ''}`} />
      ))}
      {v.set.items.length > items.length ? <Body size={12} color={color.muted}>+{v.set.items.length - items.length} more</Body> : null}
    </Card>
  );
}

function StageSong({ v, onHear, onPlay }: { v: JourneyView; onHear: (id: string) => void; onPlay: (id: string) => void }) {
  const s = v.song;
  return (
    <Card style={[styles.colSong, styles.song]} testID="journey-song">
      <Label>Stage song</Label>
      {s ? (
        <>
          <View style={styles.youTop}>
            <Ring fraction={ratio(s.ready, s.bars)} fill={color.teal} value={`${s.ready}/${s.bars}`} caption="bars"
              accessibilityLabel={`${s.title}: ${s.ready} of ${s.bars} bars ready`} />
            <View style={styles.flexShrink}>
              <Display size={type.rank} numberOfLines={1}>{s.title}</Display>
              <Body size={13} numberOfLines={3}>{s.text}</Body>
            </View>
          </View>
          <View style={styles.btns}>
            <Button size="small" emoji="👂" label="Hear it" onPress={() => onHear(s.lessonId)} accessibilityLabel={`Hear ${s.title}`} />
            <Button size="small" emoji="▶" label="Play it" onPress={() => onPlay(s.lessonId)} accessibilityLabel={`Play ${s.title}`} />
          </View>
        </>
      ) : <Body size={13}>Every stage has a song with the band. This one is done.</Body>}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  noticeBtns: { flexDirection: 'row', gap: 8 },
  week: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8, marginBottom: 8 },
  tileCell: { flexGrow: 0, flexBasis: '23.6%' },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  b: { fontWeight: '800' },
  next: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  nextTop: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, paddingHorizontal: 14 },
  bigIcon: { fontSize: 58, lineHeight: 64 },
  heroText: { flex: 1, minWidth: 0 },
  heroTitle: { marginTop: 6, marginBottom: 4 },
  step: { fontSize: 16, fontWeight: '800', color: color.ink },
  stepMeta: { fontWeight: '600' },
  what: { marginTop: 3 },
  previewSpace: { width: 0 },
  moves: { flexDirection: 'row', gap: 14 },
  moveMain: { flex: 2, minWidth: 0 },
  move: { flex: 1, minWidth: 0 },
  rowB: { flexDirection: 'row', gap: 16, marginTop: 13 },
  colYou: { width: 292 },
  tile: { paddingHorizontal: 5 }, // "day streak" fits on one line in a third of the card
  colSet: { width: 316 }, // a little wider than the mockup's 300: "Double strokes · warm-up" fits beside its minutes
  colSong: { flex: 1, minWidth: 0 },
  you: { gap: 10 },
  youTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { marginTop: 4 },
  three: { flexDirection: 'row', gap: 6 },
  setHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  setMin: { fontSize: 13, fontWeight: '800', color: color.ink },
  bar: { height: 12, borderWidth: 2, borderColor: color.ink, backgroundColor: color.panel, marginTop: 8, marginBottom: 4, flexDirection: 'row', overflow: 'hidden' },
  barSeg: { height: '100%', borderRightWidth: 2, borderRightColor: color.ink },
  song: { gap: 8 },
  btns: { flexDirection: 'row', gap: 10 },
  trail: { marginTop: 13, paddingTop: 9, paddingHorizontal: 16, paddingBottom: 6 },
  trailHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chev: { fontSize: 18, fontWeight: '700', color: color.ink },
});
