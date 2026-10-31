// Progress (docs/mockups/ipad/progress.html): getting better (notes landed per day played, with the coach's line), this
// week against your goal, the skill map, trophies and the closest, your time against the daily goal, and your lessons
// in plain words, with the web's show-off set (ready songs, ▶ Play it, a concert of the set). "This month's report", the full skill map and your path open in place, as /progress?view=month,
// /progress?view=skills and /progress?view=path (Journey's Skill map and Full path buttons), Coming up and all your lessons as
// /progress?view=coming and /progress?view=lessons. The numbers are in progress.ts.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Body, Button, Card, CardTitle, CoachLine, Label, ListRow, Screen, Stars, StatTile, Strong, TitleBar,
  color, slopFor, stroke, tabular, useAppSettings,
  Bars, Track,
} from '../../ui';
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
import { useStoredData } from './useStoredData';

/** Back to where a row was played: a lesson, an exercise on Practice (a bit above your best clean tempo), or a song. */
export function openTarget(t: PractiseTarget) {
  if (t.kind === 'lesson') router.push(lessonHref(t.lessonId) as never);
  else if (t.kind === 'practice') router.push({ pathname: '/practice/play', params: { chartId: t.chartId, ...(t.bpm ? { bpm: String(t.bpm) } : {}) } });
  else router.push(songHref(t.songId) as never); // a YouTube song: its page, as the web's ProgressView opens it
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

  // The card budget (mockup progress.html, 1194×834): row 1 232 pt, row 2 258 pt, row 3 the rest (~190 pt). Nothing
  // in a card scrolls on the main view: the skill map shows 3 skills, Your lessons 3 rows, Coming up a line each; the
  // rest opens in place ("+ N more", "All N lessons", "Open").
  const SKILL_ROWS = 3, LATER_CHIPS = 2, LESSON_ROWS = 3;
  const skillRows = [...m.skills.now.map(k => ({ k, g: 'Working on now' })), ...m.skills.next.map(k => ({ k, g: 'Next on your path' }))];
  const shownSkills = skillRows.slice(0, SKILL_ROWS);
  const moreSkills = Math.max(0, m.skills.later.length - LATER_CHIPS) + Math.max(0, skillRows.length - SKILL_ROWS);
  const lessonRows = [...m.lessons.map(r => ({ key: r.chartId, title: r.title, detail: r.words, stars: r.stars, played: r.played, practise: r.practise,
    label: `${r.title}: ${r.words}. ${r.takes} takes, best ${r.best}%, played ${r.played}` })),
    ...m.exercises.map(x => ({ key: x.chartId, title: x.title, detail: 'Practice exercise', stars: undefined, played: '', practise: x.practise, label: `${x.title}: practice exercise` }))];

  const head = (
    <TitleBar title="Progress" right={<View style={styles.right}>
      {m.since ? <View style={styles.since}><Body size={14} weight="800" numberOfLines={1}>{m.since}</Body></View> : null}
      <View style={styles.grow} />
      {view === 'main'
        ? <View style={styles.headButtons}>
          <Button label="This month's report" emoji="📝" onPress={() => setView('month')} testID="progress-month" />
          <Button label="For your teacher" emoji="🧑‍🏫" onPress={() => setView('teacher')} testID="progress-teacher-open" />
        </View>
        : <Button label="Progress" emoji="←" onPress={() => setView('main')} testID="progress-back" />}
    </View>} />
  );
  if (view === 'coming') return (
    <Screen testID="screen-progress">{head}
      <Card style={styles.page} testID="progress-coming-page">
        <CardTitle>Coming up</CardTitle>
        <ScrollView style={styles.grow} contentContainerStyle={styles.pageList}>
          <View testID="progress-showoff-set">
            <Body weight="900">🎤 Show-off set</Body>
            {m.showoff.songs.length ? <>
              {m.showoff.songs.map((x, i) => (
                <ListRow key={x.id} first={i === 0} compact title={x.title} testID={`progress-showoff-${i}`}
                  value={<Button label="Play it" emoji="▶" size="small" onPress={() => router.push(songHref(x.id) as never)} accessibilityLabel={`Play ${x.title}`} />} />
              ))}
              {m.showoff.concert ? (
                <Button label="Concert: the whole set" emoji="🎤" size="small" testID="progress-concert"
                  onPress={() => { const first = startConcert(m.showoff.concert!); if (first) router.push(songHref(first.id, first.bars) as never); }} />
              ) : null}
            </> : <Body size={14} color={color.muted} testID="progress-showoff-empty">{m.showoff.empty}</Body>}
          </View>
          <View testID="progress-fills-list">
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
      <Card style={styles.page} testID="progress-lessons-page">
        <CardTitle>Your lessons</CardTitle>
        <ScrollView style={styles.grow}>
          {lessonRows.map((r, i) => <LessonRow key={r.key} r={r} first={i === 0} testID={`progress-lessons-row-${i}`} />)}
        </ScrollView>
      </Card>
    </Screen>
  );
  if (view === 'teacher') return <Screen testID="screen-progress">{head}<TeacherView runs={data?.runs ?? []} lessons={data?.lessons ?? []} /></Screen>;
  if (view === 'month') return <Screen testID="screen-progress">{head}<MonthReportView runs={data?.runs ?? []} /></Screen>;
  if (view === 'path') return <Screen testID="screen-progress">{head}<PathView lessons={data?.lessons ?? []} progress={settings.lessons} profile={settings.profile} /></Screen>;
  if (view === 'skills') return <Screen testID="screen-progress">{head}<SkillMapView lessons={data?.lessons ?? []} progress={settings.lessons} /></Screen>;

  const b = m.better, w = m.week, t = m.trophies;
  return (
    <Screen testID="screen-progress">
      {head}
      <View style={styles.row1}>
        <Card style={styles.better} testID="progress-better">
          <View style={styles.betterMain}>
            <CoachLine size={16} mascot="sm"><Strong>Getting better. </Strong>{b.line}</CoachLine>
            <View style={styles.grow} />
            {b.days.length ? (
              <Bars height={84} max={100} showLast accessibilityLabel="Notes landed per day you played, in percent" testID="progress-landed"
                bars={b.days.map((d, i) => ({ key: d.date, value: d.pct, label: d.label, title: d.title, fill: i >= b.days.length - 5 ? color.blue : '#A9C4F5' }))} />
            ) : <View style={styles.emptyChart}><Body color={color.muted}>Notes landed, per day you played.</Body></View>}
          </View>
          <View style={styles.tiles}>
            <StatTile value={b.landed} label={`notes landed of ${b.notes}`} testID="progress-landed-total" />
            <StatTile value={b.best?.pct ?? '—'} label={b.best ? `best take (${b.best.of})` : 'best take'} />
            <StatTile value={`★ ${b.stars}`} label="stars from lessons" />
          </View>
        </Card>

        <Card style={styles.week} testID="progress-week">
          <View style={styles.cardHead}><CardTitle size={18}>This week</CardTitle><Body size={13} color={color.muted}>{`goal ${w.goal} min a day`}</Body></View>
          <View style={styles.dots}>
            {w.dots.map(d => (
              <View key={d.day} style={styles.dayCol} accessible accessibilityLabel={d.title}>
                <View style={[styles.dayDot, d.on && styles.dayOn, d.today && styles.dayToday]}><Text style={styles.fire}>{d.on ? '🔥' : ''}</Text></View>
                <Text style={styles.dayLetter}>{d.letter}</Text>
              </View>
            ))}
          </View>
          <View style={styles.streak}><Text style={[styles.streakN, tabular]}>{w.streak}</Text><Body weight="800">{`🔥 ${w.streakWords}`}</Body></View>
          <Body size={14}><Strong>{String(w.minutes)}</Strong>{` of ${w.goalMinutes} minutes`}</Body>
          <Track done={w.fraction} fill={color.good} height={16} />
          {w.focus ? <Body size={14} numberOfLines={1}>{'Focus: '}<Strong>{w.focus}</Strong></Body> : null}
          <Body size={12.5} color={color.muted} numberOfLines={1}>{w.rank}</Body>
        </Card>
      </View>

      <View style={styles.row2}>
        <Card style={styles.skills} testID="progress-skills">
          <View style={styles.cardHead}>
            <CardTitle size={18}>Skill map</CardTitle>
            <Body size={13} color={color.muted}>your coach plans weeks from it</Body>
          </View>
          {shownSkills.map(({ k, g }, i) => (
            <View key={k.id}>
              {i === 0 || shownSkills[i - 1].g !== g ? <Label style={styles.group}>{g}</Label> : null}
              <View style={styles.skill} accessible={!k.refresh} accessibilityLabel={`${k.name}: ${k.label}`}>
                <View style={styles.skillName}><Body size={15} weight="800" numberOfLines={1}>{k.name}</Body><Body size={12} color={color.muted} numberOfLines={1}>{k.what}</Body></View>
                <Track done={k.doneFraction} started={k.startedFraction} style={styles.skillTrack} />
                <Body size={13} weight="700" numberOfLines={1} style={styles.skillN}>{`${k.done} of ${k.all} lessons`}</Body>
                {k.refresh ? (
                  <Pressable onPress={() => router.push(lessonHref(k.refresh!) as never)} hitSlop={slopFor(36)} accessibilityRole="button" accessibilityLabel={`Refresh ${k.name}`}
                    style={({ pressed }) => [styles.refresh, pressed && styles.pressed]} testID={`progress-refresh-${k.id}`}><Text style={styles.refreshIcon}>🔁</Text></Pressable>
                ) : <View style={styles.refreshGap} />}
              </View>
            </View>
          ))}
          {!shownSkills.length ? <Body color={color.muted}>Every lesson trains one or more skills. They fill in as you play.</Body> : null}
          <View style={styles.grow} />
          <View style={styles.later}>
            {m.skills.later.length ? <Body size={13} weight="800">Later:</Body> : null}
            {m.skills.later.slice(0, LATER_CHIPS).map(k => <View key={k.id} style={styles.laterChip}><Body size={12.5} weight="700" numberOfLines={1}>{`${k.name} ${k.count}`}</Body></View>)}
            <Pressable onPress={() => setView('skills')} hitSlop={slopFor(30)} accessibilityRole="button" accessibilityLabel="All skills: the whole skill map"
              style={({ pressed }) => [styles.laterChip, styles.allChip, pressed && styles.pressed]} testID="progress-skill-map">
              <Body size={12.5} weight="800" numberOfLines={1}>{moreSkills ? `+ ${moreSkills} more` : 'All skills'}</Body>
            </Pressable>
          </View>
        </Card>

        <Card style={styles.trophies} testID="progress-trophies">
          <View style={styles.cardHead}><CardTitle size={18}>Trophies</CardTitle><Body size={13} color={color.muted}>{`${t.earned} earned`}</Body></View>
          {t.earned ? (
            <View style={styles.medals}>
              {[...t.ranks.map(r => ({ key: `r${r.level}`, icon: '🎖', name: r.name, sub: r.proven ? '✓ proven' : '', label: r.title })),
                ...t.badges.map(x => ({ key: x.id, icon: '🏅', name: x.name, sub: '', label: x.how }))].slice(0, 4).map(x => (
                <View key={x.key} style={styles.medal} accessible accessibilityLabel={`${x.name}. ${x.label}`}>
                  <View style={styles.medalIcon}><Text style={styles.medalEmoji}>{x.icon}</Text></View>
                  <Text style={styles.medalName} numberOfLines={2}>{x.name}</Text>
                  {x.sub ? <Text style={styles.proven}>{x.sub}</Text> : null}
                </View>
              ))}
            </View>
          ) : <Body weight="800">None yet. Your first one is the closest below.</Body>}
          {t.closest.slice(0, t.earned ? 2 : 3).map(c => (
            <View key={c.id} style={styles.close} accessible accessibilityLabel={`${c.name}: ${c.words}. ${c.how}`}>
              <View style={styles.grow}><Body weight="800" numberOfLines={1}>{c.name}</Body><Track done={c.fraction} height={14} /></View>
              <Body size={13} weight="700" style={tabular}>{c.words}</Body>
            </View>
          ))}
          {/* the web's "Later:" line: every trophy not shown above, and the rank trophies still locked */}
          {[...t.closest.slice(t.earned ? 2 : 3).map(c => c.name), ...t.later].length ? (
            <Body size={12} color={color.muted} numberOfLines={2} testID="progress-trophies-later">
              {`Later: ${[...t.closest.slice(t.earned ? 2 : 3).map(c => c.name), ...t.later].join(' · ')}`}
            </Body>
          ) : null}
        </Card>
      </View>

      <View style={styles.row3}>
        <Card style={styles.time} testID="progress-time">
          <View style={styles.cardHead}><CardTitle size={18}>Your time</CardTitle><Body size={13} color={color.muted}>14 days</Body></View>
          <View style={styles.grow} />
          <Bars height={66} max={m.time.top} line={{ value: m.time.goal, words: `${m.time.goal} min` }} accessibilityLabel={`Minutes played per day, last 14 days, against your goal of ${m.time.goal} a day`}
            bars={m.time.days.map(d => ({ key: d.date, value: d.minutes, title: d.title, fill: d.atGoal ? color.good : '#A8DDBE' }))} />
          <View style={styles.timeFoot}><Body size={11} color={color.muted}>{m.time.from}</Body><Body size={11} color={color.muted}>today</Body></View>
        </Card>
        <Card style={styles.showoff} testID="progress-coming-up">
          <View style={styles.cardHead}>
            <CardTitle size={18}>Coming up</CardTitle>
            <Button label="Open" size="small" onPress={() => setView('coming')} testID="progress-coming-open" accessibilityLabel="Open Coming up: show-off set and your fills" />
          </View>
          <View style={styles.comingLine} testID="progress-showoff">
            <Body weight="900" numberOfLines={1}>🎤 Show-off set</Body>
            <Body size={13} color={color.muted} numberOfLines={1}>{m.showoff.songs.length ? `${m.showoff.songs.length} song${m.showoff.songs.length === 1 ? '' : 's'} ready to play` : '16 bars of a song, every bar at 85%'}</Body>
          </View>
          <View style={styles.comingLine} testID="progress-fills">
            <Body weight="900" numberOfLines={1}>🥁 Your fills</Body>
            <Body size={13} color={color.muted} numberOfLines={1}>{m.fills.rows.length ? `${m.fills.rows.length} kept · newest ${m.fills.rows[0].line.split(' · ')[0]}` : 'none kept yet'}</Body>
          </View>
        </Card>
        <Card style={styles.lessons} testID="progress-lessons">
          <View style={styles.cardHead}>
            <CardTitle size={18}>Your lessons</CardTitle>
            {lessonRows.length > LESSON_ROWS
              ? <Button label={`All ${lessonRows.length}`} size="small" onPress={() => setView('lessons')} testID="progress-lessons-all" accessibilityLabel={`All ${lessonRows.length} lessons and exercises`} />
              : <Body size={13} color={color.muted}>newest first</Body>}
          </View>
          {lessonRows.length
            ? lessonRows.slice(0, LESSON_ROWS).map((r, i) => <LessonRow key={r.key} r={r} first={i === 0} testID={`progress-lesson-${i}`} />)
            : <Body color={color.muted}>Each lesson you play shows here: how far along it is, in plain words.</Body>}
        </Card>
      </View>
    </Screen>
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
  right: { flex: 6, flexDirection: 'row', alignItems: 'center', gap: 12 }, // the title bar's spacer (flex 1) gives way to the since line
  since: { flexShrink: 1, backgroundColor: color.cream, borderWidth: stroke.card, borderColor: color.ink, paddingHorizontal: 10, paddingVertical: 3 },
  grow: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
  headButtons: { flexDirection: 'row', gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row1: { flexDirection: 'row', gap: 18, height: 232 },
  row2: { flexDirection: 'row', gap: 18, height: 258, marginTop: 18 },
  row3: { flexDirection: 'row', gap: 18, flex: 1, marginTop: 18, minHeight: 150 },
  // the coach's line over the chart; the three tiles down the right, the card's full height (they never sit under the line)
  better: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 14 },
  betterMain: { flex: 1, minWidth: 0, gap: 8 },
  emptyChart: { height: 84, justifyContent: 'flex-end', borderBottomWidth: stroke.card, borderBottomColor: color.ink, paddingBottom: 6 },
  tiles: { width: 150, gap: 6 },
  week: { width: 290, gap: 6 },
  dots: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 2 },
  dayDot: { width: 32, height: 32, borderRadius: 16, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: color.orange },
  dayToday: { backgroundColor: color.pop },
  fire: { fontSize: 15 },
  dayLetter: { fontSize: 11, fontWeight: '900', color: color.ink },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakN: { fontSize: 38, fontWeight: '900', color: color.ink, lineHeight: 42 },
  skills: { flex: 1, minWidth: 0, gap: 2 },
  group: { marginTop: 4, marginBottom: 1 }, // the kit's Label (ink, yellow type): a pop background hid its text
  skill: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40, borderBottomWidth: 1, borderBottomColor: color.separator },
  skillName: { width: 190 },
  skillTrack: { flex: 1 },
  skillN: { width: 112, textAlign: 'right' },
  refresh: { width: 32, height: 32, borderRadius: 16, borderWidth: stroke.thin, borderColor: color.ink, backgroundColor: color.pop, alignItems: 'center', justifyContent: 'center' },
  refreshIcon: { fontSize: 15 },
  refreshGap: { width: 32 },
  later: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 6, overflow: 'hidden' },
  laterChip: { flexShrink: 1, minWidth: 0, borderWidth: stroke.thin, borderColor: color.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  allChip: { flexShrink: 0, backgroundColor: color.cream },
  trophies: { width: 330, gap: 8 },
  medals: { flexDirection: 'row', gap: 6 },
  medal: { flex: 1, alignItems: 'center', gap: 2 },
  medalIcon: { width: 48, height: 48, borderRadius: 24, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.pop, alignItems: 'center', justifyContent: 'center' },
  medalEmoji: { fontSize: 22 },
  medalName: { fontSize: 12, fontWeight: '900', color: color.ink, textAlign: 'center' },
  proven: { fontSize: 11.5, fontWeight: '800', color: color.good },
  close: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { width: 250, gap: 6 },
  showoff: { width: 226, gap: 8 },
  comingLine: { gap: 1 },
  timeFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  lessons: { flex: 1, minWidth: 0, gap: 2 },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  lessonRule: { borderTopWidth: 1, borderTopColor: color.separator },
  lessonTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  page: { flex: 1, gap: 10 },
  pageList: { gap: 18 },
});
