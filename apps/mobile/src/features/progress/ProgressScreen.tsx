// You (D10 reorganisation, docs/mobile/reorg/you-after.png): Progress plus the coach's week plan. Getting better (the
// coach's line over notes landed per day) and This week (days played, streak, minutes, the focus), then six doors:
// Path & skills, Trophies, Your lessons, Coach's week plan, Show-off & fills, Reports (this month's report, for your
// teacher). Each opens in place as /you?view=path|skills|trophies|lessons|plan|coming|reports|month|teacher
// (/progress?view=… redirects here; Journey's Skill map and Full path land on them). "Your time" is cut (D10). The numbers are in progress.ts, the
// doors' words in you.ts.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Bars, Body, Button, Card, Chevron, CoachLine, Label, ListRow, Screen, Segmented, Stars, StatTile, Strong, TitleBar, Track,
  color, font, hardShadow, openCoachChat, stroke, tabular, useAppSettings,
} from '../../ui';
import { PlanCard } from '../coach/PlanCard';
import { useWeekPlan } from '../coach/coach';
import { getStorage } from '../../platform/storage';
import { lessonHref } from '../lesson/route';
import type { PracticeChart } from '../practice/catalog';
import { practiceEngine } from '../practice/engine';
import { readPlayOptions } from '../practice/play';
import { songHref, startConcert } from '../songs/songsModel';
import { MonthReportView } from './MonthReportView';
import { progressViewOf, type ProgressViewId } from './path';
import { PathView } from './PathView';
import { progressModel, type PractiseTarget } from './progress';
import { SkillMapView } from './SkillMapView';
import { TeacherView } from './TeacherView';
import { youDoors, type Door } from './you';
import { useStoredData } from './useStoredData';

/** Back to where a row was played: a lesson, an exercise on Practice (a bit above your best clean tempo), or a song. */
export function openTarget(t: PractiseTarget) {
  if (t.kind === 'lesson') router.push(lessonHref(t.lessonId));
  else if (t.kind === 'practice') router.push({ pathname: '/practice/play', params: { chartId: t.chartId, ...(t.bpm ? { bpm: String(t.bpm) } : {}) } });
  else router.push(songHref(t.songId)); // a YouTube song: its page, as the web's ProgressView opens it
}

export function ProgressScreen() {
  const settings = useAppSettings();
  const { data } = useStoredData();
  const params = useLocalSearchParams<{ view?: string }>();
  const view = progressViewOf(params.view);
  const setView = (v: ProgressViewId) => router.setParams({ view: v === 'main' ? undefined : v });
  // Your fills: 🎧 Hear it plays the fill twice with a bar of count-in (the web's hearFill), as a demo: never saved.
  const eng = useSyncExternalStore(practiceEngine.subscribe, practiceEngine.get);
  const hearing = eng.demo && (eng.phase === 'playing' || eng.phase === 'starting') && eng.chartId?.startsWith('fill-') ? eng.chartId : undefined;
  const [notice, setNotice] = useState('');
  useFocusEffect(useCallback(() => () => { if (practiceEngine.get().chartId?.startsWith('fill-')) practiceEngine.stop(); }, []));
  const hearFill = (chart: PracticeChart) => {
    if (hearing) { practiceEngine.stop(); if (hearing === chart.id) return; }
    const ok = practiceEngine.start({ chart, options: { ...readPlayOptions(getStorage().kv), chartId: chart.id, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false },
      section: null, demo: true, repeats: 2 });
    setNotice(ok ? '' : practiceEngine.notReady);
  };
  const m = useMemo(() => progressModel({ runs: data?.runs ?? [], progress: settings.lessons, profile: settings.profile, badges: settings.badges, lessons: data?.lessons ?? [], plan: data?.plan, songs: data?.songs, fills: settings.fills }),
    [data, settings.lessons, settings.profile, settings.badges, settings.fills]);

  const savedPlan = useWeekPlan();
  const doors = youDoors(m, savedPlan?.plan);
  const lessonRows = [...m.lessons.map(r => ({ key: r.chartId, title: r.title, detail: r.words, stars: r.stars, played: r.played, practise: r.practise,
    label: `${r.title}: ${r.words}. ${r.takes} takes, best ${r.best}%, played ${r.played}` })),
    ...m.exercises.map(x => ({ key: x.chartId, title: x.title, detail: 'Practice exercise', stars: undefined, played: '', practise: x.practise, label: `${x.title}: practice exercise` }))];
  const b = m.better, w = m.week, t = m.trophies;

  // The title bar: "You" with the rank chip and Talk to the coach; a detail view says where it is and goes back to You.
  const TITLES: Partial<Record<ProgressViewId, string>> = {
    path: 'Path & skills', skills: 'Path & skills', trophies: 'Trophies', lessons: 'Your lessons', plan: 'Coach’s week plan',
    coming: 'Show-off & fills', reports: 'Reports', month: 'This month’s report', teacher: 'For your teacher',
  };
  const back: ProgressViewId = view === 'month' || view === 'teacher' ? 'reports' : 'main';
  const head = view === 'main' ? (
    <TitleBar title="You" right={<View style={styles.right}>
      <View style={styles.since}><Body size={14} weight="800" numberOfLines={1}>{w.rankShort}</Body></View>
      <View style={styles.grow} />
      <Button label="Talk to the coach" emoji="💬" onPress={openCoachChat} testID="you-talk" />
    </View>} />
  ) : (
    <TitleBar title={TITLES[view] ?? 'You'} right={<View style={styles.right}>
      <View style={styles.grow} />
      {view === 'path' || view === 'skills' ? (
        <Segmented accessibilityLabel="Path or skill map" value={view} onChange={v => setView(v)} testID="you-path-skills"
          options={[{ value: 'path', label: 'Your path' }, { value: 'skills', label: 'Skill map' }]} />
      ) : null}
      <Button label={back === 'reports' ? 'Reports' : 'You'} emoji="‹" onPress={() => setView(back)} testID="progress-back" />
    </View>} />
  );

  if (view === 'coming') return (
    <Screen testID="screen-progress">{head}
      <Card style={styles.page} testID="progress-coming-page">
        <ScrollView style={styles.grow} contentContainerStyle={styles.pageList}>
          <View testID="progress-showoff">
            <Body weight="900">🎤 Show-off set</Body>
            {m.showoff.songs.length ? <>
              {m.showoff.songs.map((x, i) => (
                <ListRow key={x.id} first={i === 0} compact title={x.title} testID={`progress-showoff-${i}`}
                  value={<Button label="Play it" emoji="▶" size="small" onPress={() => router.push(songHref(x.id))} accessibilityLabel={`Play ${x.title}`} />} />
              ))}
              {m.showoff.concert ? (
                <Button label="Concert: the whole set" emoji="🎤" size="small" testID="progress-concert"
                  onPress={() => { const first = startConcert(m.showoff.concert!); if (first) router.push(songHref(first.id, first.bars)); }} />
              ) : null}
            </> : <Body size={14} color={color.muted} testID="progress-showoff-empty">{m.showoff.empty}</Body>}
          </View>
          <View testID="progress-fills">
            <Body weight="900">🥁 Your fills</Body>
            {m.fills.rows.length ? m.fills.rows.map((f, i) => (
              <ListRow key={f.id} first={i === 0} compact title={f.line} testID={`progress-fill-${i}`}
                value={<Button label={hearing === f.chart.id ? 'Stop' : 'Hear it'} emoji={hearing === f.chart.id ? '■' : '🎧'} size="small"
                  onPress={() => hearFill(f.chart)} accessibilityLabel={`Hear your fill, ${f.line}`} />} />
            )) : <Body size={14} color={color.muted}>{m.fills.empty}</Body>}
            {notice ? <Body size={13} color={color.bad}>{notice}</Body> : null}
          </View>
        </ScrollView>
      </Card>
    </Screen>
  );
  if (view === 'lessons') return (
    <Screen testID="screen-progress">{head}
      <View style={styles.tilesRow}>
        <StatTile value={`★ ${b.stars}`} label="stars from lessons" />
        <StatTile value={String(lessonRows.length)} label="lessons and exercises played" />
      </View>
      <Card style={styles.page} testID="progress-lessons-page">
        <ScrollView style={styles.grow}>
          {lessonRows.length
            ? lessonRows.map((r, i) => <LessonRow key={r.key} r={r} first={i === 0} testID={`progress-lesson-${i}`} />)
            : <Body color={color.muted}>Each lesson you play shows here: how far along it is, in plain words.</Body>}
        </ScrollView>
      </Card>
    </Screen>
  );
  if (view === 'trophies') return (
    <Screen testID="screen-progress">{head}
      <View style={styles.tilesRow}>
        <StatTile value={b.landed} label={`notes landed of ${b.notes}`} testID="progress-landed-total" />
        <StatTile value={b.best?.pct ?? '—'} label={b.best ? `best take (${b.best.of})` : 'best take'} />
        <StatTile value={String(t.earned)} label="trophies earned" />
      </View>
      <Card style={styles.page} testID="progress-trophies">
        <ScrollView style={styles.grow} contentContainerStyle={styles.pageList}>
          {t.earned ? (
            <View style={styles.medals}>
              {[...t.ranks.map(r => ({ key: `r${r.level}`, icon: '🎖', name: r.name, sub: r.proven ? '✓ proven' : '', label: r.title })),
                ...t.badges.map(x => ({ key: x.id, icon: '🏅', name: x.name, sub: '', label: x.how }))].map(x => (
                <View key={x.key} style={styles.medal} accessible accessibilityLabel={`${x.name}. ${x.label}`}>
                  <View style={styles.medalIcon}><Text style={styles.medalEmoji}>{x.icon}</Text></View>
                  <Text style={styles.medalName} numberOfLines={2}>{x.name}</Text>
                  {x.sub ? <Text style={styles.proven}>{x.sub}</Text> : null}
                </View>
              ))}
            </View>
          ) : <Body weight="800">None yet. Your first one is the closest below.</Body>}
          <View style={styles.closeList}>
            <Label>Closest</Label>
            {t.closest.map(c => (
              <View key={c.id} style={styles.close} accessible accessibilityLabel={`${c.name}: ${c.words}. ${c.how}`}>
                <View style={styles.grow}><Body weight="800" numberOfLines={1}>{c.name}</Body><Body size={12.5} color={color.muted} numberOfLines={1}>{c.how}</Body><Track done={c.fraction} height={14} /></View>
                <Body size={13} weight="700" style={tabular}>{c.words}</Body>
              </View>
            ))}
          </View>
          {t.later.length ? <Body size={13} color={color.muted} testID="progress-trophies-later">{`Later: ${t.later.join(' · ')}`}</Body> : null}
        </ScrollView>
      </Card>
    </Screen>
  );
  if (view === 'plan') return <Screen testID="screen-progress">{head}<View style={styles.planWrap}><PlanCard /></View></Screen>;
  if (view === 'reports') return (
    <Screen testID="screen-progress">{head}
      <View style={styles.doors}>
        <DoorTile door={{ id: 'month', emoji: '📝', title: 'This month’s report', sub: 'you vs you, month by month, the coach’s report', view: 'month' }} onOpen={setView} testID="progress-month" />
        <DoorTile door={{ id: 'teacher', emoji: '🧑‍🏫', title: 'For your teacher', sub: 'a page to share, and their notes', view: 'teacher' }} onOpen={setView} testID="progress-teacher-open" />
      </View>
    </Screen>
  );
  if (view === 'teacher') return <Screen testID="screen-progress">{head}<TeacherView runs={data?.runs ?? []} lessons={data?.lessons ?? []} /></Screen>;
  if (view === 'month') return <Screen testID="screen-progress">{head}<MonthReportView runs={data?.runs ?? []} /></Screen>;
  if (view === 'path') return <Screen testID="screen-progress">{head}<PathView lessons={data?.lessons ?? []} progress={settings.lessons} profile={settings.profile} /></Screen>;
  if (view === 'skills') return <Screen testID="screen-progress">{head}<SkillMapView lessons={data?.lessons ?? []} progress={settings.lessons} /></Screen>;

  return (
    <Screen testID="screen-progress">
      {head}
      <View style={styles.row1}>
        <Card style={styles.better} testID="progress-better">
          <CoachLine size={17} mascot="sm"><Strong>Getting better. </Strong>{b.line}</CoachLine>
          <View style={styles.grow} />
          {b.days.length ? (
            <Bars height={168} max={100} showLast accessibilityLabel="Notes landed per day you played, in percent" testID="progress-landed"
              bars={b.days.map((d, i) => ({ key: d.date, value: d.pct, label: d.label, title: d.title, fill: i >= b.days.length - 5 ? color.blue : '#A9C4F5' }))} />
          ) : <View style={styles.emptyChart}><Body color={color.muted}>Play your first take: the notes you land show here, day by day.</Body></View>}
          <Body size={12.5} weight="700" color={color.muted}>notes landed per day you played</Body>
        </Card>

        <Card style={styles.week} testID="progress-week">
          <Label>This week</Label>
          <View style={styles.dots}>
            {w.dots.map(d => (
              <View key={d.day} style={styles.dayCol} accessible accessibilityLabel={d.title}>
                <View style={[styles.dayDot, d.on && styles.dayOn, d.today && styles.dayToday]}><Text style={styles.fire}>{d.on ? '🔥' : ''}</Text></View>
              </View>
            ))}
          </View>
          <View style={styles.streak}><Text style={[styles.streakN, tabular]}>{w.streak}</Text><Body size={18} weight="800">{w.streakWords}</Body></View>
          <Body size={15} weight="800">{`${w.minutes} of ${w.goalMinutes} minutes`}</Body>
          <Track done={w.fraction} fill={color.good} height={16} />
          <View style={styles.grow} />
          {w.focus ? <Body size={14}>{'🎯 Focus: '}<Strong>{w.focus}</Strong>{w.focusFromPlan ? ' (coach’s plan)' : ''}</Body> : null}
        </Card>
      </View>

      <View style={styles.doors}>
        {doors.map(d => <DoorTile key={d.id} door={d} onOpen={setView} testID={`you-door-${d.id}`} />)}
      </View>
    </Screen>
  );
}

/** One door: an icon, a title, one line, a chevron (you-after.png). */
function DoorTile({ door, onOpen, testID }: { door: Door; onOpen: (v: ProgressViewId) => void; testID?: string }) {
  return (
    <Pressable onPress={() => onOpen(door.view)} accessibilityRole="button" accessibilityLabel={`${door.title}: ${door.sub}`} testID={testID}
      style={({ pressed }) => [styles.door, pressed && styles.pressed]}>
      <Text style={styles.doorEmoji}>{door.emoji}</Text>
      <View style={styles.grow}>
        <Text style={styles.doorTitle} numberOfLines={1}>{door.title}</Text>
        <Text style={styles.doorSub} numberOfLines={1}>{door.sub}</Text>
      </View>
      <Chevron />
    </Pressable>
  );
}

type LessonRowData = { title: string; detail: string; stars?: number; played: string; practise: PractiseTarget; label: string };

/** A lesson in plain words: the title (with its stars) over how far along it is; when, and Practise. One line each, cut with "…". */
function LessonRow({ r, first, testID }: { r: LessonRowData; first?: boolean; testID?: string }) {
  return (
    <View style={[styles.lessonRow, !first && styles.lessonRule]} testID={testID} accessibilityLabel={r.label}>
      <View style={styles.grow}>
        <View style={styles.lessonTitle}>
          <Body size={14.5} weight="800" numberOfLines={1} style={styles.shrink}>{r.title}</Body>
          {r.stars ? <Stars n={r.stars} size={12} /> : null}
        </View>
        <Body size={12.5} color={color.muted} numberOfLines={1}>{r.detail}</Body>
      </View>
      {r.played ? <Body size={12.5} color={color.muted}>{r.played}</Body> : null}
      <Button label="Practise" size="small" onPress={() => openTarget(r.practise)} accessibilityLabel={`Practise ${r.title}`} />
    </View>
  );
}

const styles = StyleSheet.create({
  right: { flex: 6, flexDirection: 'row', alignItems: 'center', gap: 12 }, // the title bar's spacer (flex 1) gives way to the chip
  since: { flexShrink: 1, backgroundColor: color.cream, borderWidth: stroke.card, borderColor: color.ink, paddingHorizontal: 10, paddingVertical: 3 },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
  row1: { flexDirection: 'row', gap: 18, height: 330 },
  better: { flex: 1, minWidth: 0, gap: 8 },
  emptyChart: { height: 168, justifyContent: 'flex-end', borderBottomWidth: stroke.card, borderBottomColor: color.ink, paddingBottom: 6 },
  week: { width: 330, gap: 8 },
  dots: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 2 },
  dayDot: { width: 36, height: 36, borderRadius: 18, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: color.orange },
  dayToday: { backgroundColor: color.pop },
  fire: { fontSize: 16 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  streakN: { fontSize: 56, fontWeight: '900', color: color.ink, lineHeight: 60 },
  doors: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 22 },
  door: { flexBasis: '30%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 80, paddingHorizontal: 16, backgroundColor: color.panel,
    borderWidth: stroke.card, borderColor: color.ink, boxShadow: hardShadow(5) },
  doorEmoji: { fontSize: 30 },
  doorTitle: { ...font.display, fontSize: 18, color: color.ink },
  doorSub: { fontSize: 13.5, fontWeight: '600', color: color.muted },
  page: { flex: 1, gap: 10 },
  pageList: { gap: 18 },
  planWrap: { flex: 1 },
  tilesRow: { flexDirection: 'row', gap: 14, marginBottom: 14, maxWidth: 720 },
  medals: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  medal: { width: 110, alignItems: 'center', gap: 2 },
  medalIcon: { width: 52, height: 52, borderRadius: 26, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.pop, alignItems: 'center', justifyContent: 'center' },
  medalEmoji: { fontSize: 24 },
  medalName: { fontSize: 12.5, fontWeight: '900', color: color.ink, textAlign: 'center' },
  proven: { fontSize: 11.5, fontWeight: '800', color: color.good },
  closeList: { gap: 10, maxWidth: 720 },
  close: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  lessonRule: { borderTopWidth: 1, borderTopColor: color.separator },
  lessonTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
