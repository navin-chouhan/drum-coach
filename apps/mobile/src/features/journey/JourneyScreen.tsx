// Journey, the home screen (docs/mockups/ipad/journey.html, png/journey.png): the coach's line; Up next with its
// groove and four moves (kit gestures: hi-hat pedal × 3 or crash × 2 = Start, ride × 2 = Something else, tom 2 × 2 =
// Hear it); You, Today's set and the stage song in one row; the stage trail, with "Find my level" (the web's placement
// link under the path, there whether or not the first run's test was taken) and Full path. One screen, no scrolling.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BigMove, Body, Button, Card, CoachLine, Display, Label, ListRow, Panel, Ring, Screen, Stars, StatTile, Tick, TitleBar, Trail,
  color, gesturesFor, ratio, readSettings, tabular, type, useKitMoves, writeSettings,
} from '../../ui';
import { getStorage } from '../../platform/storage';
import { getCoach, useCoachEntry } from '../coach/coach';
import { lessonHref } from '../lesson/route';
import { GroovePreview } from './GroovePreview';
import { startSessionPatch } from './source';
import { useJourney } from './useJourney';
import type { JourneyView } from './model';

export function JourneyScreen() {
  const [swap, setSwap] = useState(0);
  const { view: v, reload } = useJourney(swap);
  // "Coach automatically": once a day, a lesson for this stage when none is waiting (the web's TodayView). Never blocks
  // playing; a server that can't be reached is skipped silently here (the asks entry keeps the error, as the web).
  useEffect(() => { if (v.coachAsk) getCoach().requestLesson(v.coachAsk, undefined, reload); }, [v.coachAsk, reload]);
  const writing = useCoachEntry(v.coachKey)?.status === 'thinking';

  const open = (lessonId: string, item = -1, mode: 'play' | 'hear' | 'jam' = 'play') => {
    if (item >= 0 && mode === 'play' && v.session.date !== readSessionDate()) writeSettings(getStorage().kv, startSessionPatch(v.session));
    router.push(lessonHref(lessonId, item, mode) as never);
  };
  const start = v.main ? () => open(v.main!.lessonId, v.main!.item, v.main!.label === 'Jam' ? 'jam' : 'play') : undefined;
  const other = v.somethingElse ? () => setSwap(n => n + 1) : undefined;
  const hear = v.hero ? () => open(v.hero!.lessonId, v.hero!.item, 'hear') : undefined;
  useKitMoves({ yes: start, next: other, listen: hear });

  return (
    <Screen testID="screen-journey">
      <TitleBar
        title="Journey"
        coach={v.healthLine ? `${v.coachLine} ${v.healthLine}` : v.coachLine}
        right={v.setupDue
          ? <Button size="small" emoji="🛠" label="Check my kit" testID="journey-check-kit" onPress={() => router.navigate('/setup' as never)} />
          : <Button size="small" emoji="🗺️" label="Skill map" testID="journey-skill-map" onPress={() => router.navigate('/progress?view=skills' as never)} />}
      />

      <Card elevation={6} style={styles.next} testID="journey-next">
        {v.hero ? <Hero v={v} writing={writing} /> : <Panel tone="pop" style={styles.nextTop}><Display size={type.hero}>🎉 Every stage done</Display></Panel>}
        <View style={styles.moves}>
          {v.main ? (
            <BigMove testID="journey-start" tone="go" emoji={v.main.emoji} label={v.main.label} gestures={gesturesFor('yes')} onPress={start} style={styles.moveMain} />
          ) : null}
          <BigMove testID="journey-something-else" emoji="↻" label="Something else" gestures={gesturesFor('next')} onPress={other} disabled={!other} style={styles.move} />
          <BigMove testID="journey-hear" emoji="👂" label="Hear it" gestures={gesturesFor('listen')} onPress={hear} disabled={!hear} style={styles.move} />
          <BigMove testID="journey-jam" emoji="🎸" label="Just jam" note="no score, with the band" disabled={!v.jamLessonId}
            onPress={v.jamLessonId ? () => open(v.jamLessonId!, -1, 'jam') : undefined} style={styles.move} />
        </View>
      </Card>

      <View style={styles.rowB}>
        <You v={v} />
        <TodaysSet v={v} onOpen={(id, item) => open(id, item)} />
        <StageSong v={v} onHear={id => open(id, -1, 'hear')} onPlay={id => open(id)} />
      </View>

      {v.trail ? (
        <Card style={styles.trail} testID="journey-trail">
          <View style={styles.trailHead}>
            <Label>{v.trail.title}</Label>
            <Body size={13} weight="700">{v.trail.summary}</Body>
            <View style={styles.flex} />
            <Button tone="plain" size="small" label="Find my level" testID="journey-find-level" accessibilityLabel="Find my level (a short placement test)"
              onPress={() => router.push('/lesson/placement' as never)} />
            <Button tone="plain" size="small" label="Full path" trailing={<Text style={styles.chev}>›</Text>} onPress={() => router.navigate('/progress?view=path' as never)} />
          </View>
          <Trail stops={v.trail.stops} onOpen={id => { const s = v.trail!.stops.find(x => x.id === id); if (s?.lessonId) open(s.lessonId); }} />
        </Card>
      ) : null}
    </Screen>
  );
}

// The stored session's date, read at tap time (the view may be a render old).
const readSessionDate = () => readSettings(getStorage().kv).session?.date;

function Hero({ v, writing }: { v: JourneyView; writing: boolean }) {
  const h = v.hero!;
  return (
    <Panel tone="pop" style={styles.nextTop}>
      <Text style={styles.bigIcon} accessible={false}>{h.icon}</Text>
      <View style={styles.heroText}>
        <Label>{h.kicker}{h.coachWrote ? ' · ✍ your coach wrote it' : ''}</Label>
        <Display size={type.hero} style={styles.heroTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} accessibilityRole="header">{h.title}</Display>
        <Text style={styles.step} numberOfLines={1}>{h.step} <Text style={styles.stepMeta}>· {h.meta}</Text></Text>
        <Body size={15} numberOfLines={writing ? 1 : 2} style={styles.what}>{h.what}</Body>
        {/* the web's <Thinking>, in the what's second line so the card keeps its height */}
        {writing ? <Body size={13} weight="700" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} testID="journey-coach-writing" accessibilityLiveRegion="polite">
          {'✍ Your coach is writing your next lesson… this can take a minute. You can keep playing; the answer will wait here.'}</Body> : null}
      </View>
      {h.preview ? <GroovePreview preview={h.preview} /> : <View style={styles.previewSpace} />}
    </Panel>
  );
}

function You({ v }: { v: JourneyView }) {
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
        <StatTile value={String(y.streak)} label="day streak" />
        <StatTile value={y.landedPct === null ? '–' : `${y.landedPct}%`} label="landed" />
        <StatTile value={String(y.minutesToday)} unit={`/${y.minutesGoal}`} label="min today" />
      </View>
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
  colSet: { width: 300 },
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
