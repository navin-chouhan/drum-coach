// Progress (docs/mockups/ipad/progress.html): getting better (notes landed per day played, with the coach's line), this
// week against your goal, the skill map, trophies and the closest, your time against the daily goal, and your lessons
// in plain words, with the web's show-off set (ready songs, ▶ Play it, a concert of the set). "This month's report", the full skill map and your path open in place, as /progress?view=month,
// /progress?view=skills and /progress?view=path (Journey's Skill map and Full path buttons). The numbers are in progress.ts.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Body, Button, Card, CardTitle, CoachLine, Label, ListRow, Screen, Stars, StatTile, Strong, TitleBar,
  color, stroke, tabular, useAppSettings,
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

  const head = (
    <TitleBar title="Progress" right={<View style={styles.right}>
      {m.since ? <View style={styles.since}><Body size={14} weight="800" numberOfLines={1}>{m.since}</Body></View> : null}
      <View style={styles.grow} />
      {view === 'main'
        ? <Button label="This month's report" emoji="📝" onPress={() => setView('month')} testID="progress-month" />
        : <Button label="Progress" emoji="←" onPress={() => setView('main')} testID="progress-back" />}
    </View>} />
  );
  if (view === 'month') return <Screen testID="screen-progress">{head}<MonthReportView runs={data?.runs ?? []} /></Screen>;
  if (view === 'path') return <Screen testID="screen-progress">{head}<PathView lessons={data?.lessons ?? []} progress={settings.lessons} profile={settings.profile} /></Screen>;
  if (view === 'skills') return <Screen testID="screen-progress">{head}<SkillMapView lessons={data?.lessons ?? []} progress={settings.lessons} /></Screen>;

  const b = m.better, w = m.week, t = m.trophies;
  return (
    <Screen testID="screen-progress">
      {head}
      <View style={styles.row1}>
        <Card style={styles.better} testID="progress-better">
          <CoachLine size={17} mascot="sm"><Strong>Getting better. </Strong>{b.line}</CoachLine>
          <View style={styles.betterBody}>
            <View style={styles.grow}>
              {b.days.length ? (
                <Bars height={110} max={100} showLast accessibilityLabel="Notes landed per day you played, in percent" testID="progress-landed"
                  bars={b.days.map((d, i) => ({ key: d.date, value: d.pct, label: d.label, title: d.title, fill: i >= b.days.length - 5 ? color.blue : '#A9C4F5' }))} />
              ) : <View style={styles.emptyChart}><Body color={color.muted}>Notes landed, per day you played.</Body></View>}
            </View>
            <View style={styles.tiles}>
              <StatTile value={b.landed} label={`notes landed of ${b.notes}`} testID="progress-landed-total" />
              <StatTile value={b.best?.pct ?? '—'} label={b.best ? `best take (${b.best.of})` : 'best take'} />
              <StatTile value={`★ ${b.stars}`} label="stars from lessons" />
            </View>
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
            <Button label="All skills" size="small" onPress={() => setView('skills')} testID="progress-skill-map" />
          </View>
          <ScrollView style={styles.grow}>
            {([['Working on now', m.skills.now], ['Next on your path', m.skills.next]] as const).map(([name, ks]) => ks.length ? (
              <View key={name}>
                <Label style={styles.group}>{name}</Label>
                {ks.map(k => (
                  <View key={k.id} style={styles.skill} accessible accessibilityLabel={`${k.name}: ${k.label}`}>
                    <View style={styles.skillName}><Body weight="800" numberOfLines={1}>{k.name}</Body><Body size={12.5} color={color.muted} numberOfLines={1}>{k.what}</Body></View>
                    <Track done={k.doneFraction} started={k.startedFraction} style={styles.skillTrack} />
                    <View style={styles.skillN}>
                      <Body size={13} weight="700">{k.count}</Body>
                      {k.refresh ? <Button label="Refresh" emoji="🔁" size="small" onPress={() => router.push(lessonHref(k.refresh!) as never)} />
                        : <Body size={11.5} color={color.muted}>{k.takes}</Body>}
                    </View>
                  </View>
                ))}
              </View>
            ) : null)}
            {m.skills.later.length ? (
              <View style={styles.later}>
                <Body size={13} weight="800">Later:</Body>
                {m.skills.later.slice(0, 4).map(k => <View key={k.id} style={styles.laterChip}><Body size={12.5} weight="700">{`${k.name} ${k.count}`}</Body></View>)}
                {m.skills.later.length > 4 ? <View style={styles.laterChip}><Body size={12.5} weight="700">{`+ ${m.skills.later.length - 4} more`}</Body></View> : null}
              </View>
            ) : null}
          </ScrollView>
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
          <Bars height={66} max={m.time.top} line={{ value: m.time.goal, words: `${m.time.goal} min` }} accessibilityLabel={`Minutes played per day, last 14 days, against your goal of ${m.time.goal} a day`}
            bars={m.time.days.map(d => ({ key: d.date, value: d.minutes, title: d.title, fill: d.atGoal ? color.good : '#A8DDBE' }))} />
          <View style={styles.timeFoot}><Body size={11} color={color.muted}>{m.time.from}</Body><Body size={11} color={color.muted}>today</Body></View>
        </Card>
        <Card style={styles.showoff} testID="progress-coming-up">
          <CardTitle size={18}>Coming up</CardTitle>
          <ScrollView style={styles.grow} contentContainerStyle={styles.comingUp}>
            <View testID="progress-showoff">
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
              </> : <Body size={13} color={color.muted} testID="progress-showoff-empty">{m.showoff.empty}</Body>}
            </View>
            <View testID="progress-fills">
              <Body weight="900">🥁 Your fills</Body>
              {m.fills.rows.length ? m.fills.rows.map((f, i) => (
                <ListRow key={f.id} first={i === 0} compact title={f.line} testID={`progress-fill-${i}`}
                  value={<Button label={hearing === f.chart.id ? 'Stop' : 'Hear it'} emoji={hearing === f.chart.id ? '■' : '🎧'} size="small"
                    onPress={() => hearFill(f.chart)} accessibilityLabel={`Hear your fill, ${f.line}`} />} />
              )) : <Body size={13} color={color.muted}>{m.fills.empty}</Body>}
              {notice ? <Body size={13} color={color.bad}>{notice}</Body> : null}
            </View>
          </ScrollView>
        </Card>
        <Card style={styles.lessons} testID="progress-lessons">
          <View style={styles.cardHead}><CardTitle size={18}>Your lessons</CardTitle><Body size={13} color={color.muted}>newest first</Body></View>
          {m.lessons.length || m.exercises.length ? (
            <ScrollView style={styles.grow}>
              {m.lessons.map((r, i) => (
                <ListRow key={r.chartId} first={i === 0} compact title={r.title} detail={r.words} testID={`progress-lesson-${i}`}
                  lead={r.stars ? <Stars n={r.stars} size={13} /> : undefined}
                  accessibilityLabel={`${r.title}: ${r.words}. ${r.takes} takes, best ${r.best}%, played ${r.played}`}
                  value={<View style={styles.rowEnd}><Body size={13} color={color.muted}>{r.played}</Body>
                    <Button label="Practise" size="small" onPress={() => openTarget(r.practise)} accessibilityLabel={`Practise ${r.title}`} /></View>} />
              ))}
              {m.exercises.map((x, i) => (
                <ListRow key={x.chartId} first={!m.lessons.length && i === 0} compact title={x.title} detail="Practice exercise"
                  value={<Button label="Practise" size="small" onPress={() => openTarget(x.practise)} accessibilityLabel={`Practise ${x.title}`} />} />
              ))}
            </ScrollView>
          ) : <Body color={color.muted}>Each lesson you play shows here: how far along it is, in plain words.</Body>}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  right: { flex: 6, flexDirection: 'row', alignItems: 'center', gap: 12 }, // the title bar's spacer (flex 1) gives way to the since line
  since: { flexShrink: 1, backgroundColor: color.cream, borderWidth: stroke.card, borderColor: color.ink, paddingHorizontal: 10, paddingVertical: 3 },
  grow: { flex: 1, minWidth: 0 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row1: { flexDirection: 'row', gap: 18, height: 232 },
  row2: { flexDirection: 'row', gap: 18, height: 258, marginTop: 18 },
  row3: { flexDirection: 'row', gap: 18, flex: 1, marginTop: 18, minHeight: 150 },
  better: { flex: 1, minWidth: 0, gap: 10 },
  betterBody: { flex: 1, flexDirection: 'row', gap: 16, alignItems: 'flex-end' },
  emptyChart: { height: 110, justifyContent: 'flex-end', borderBottomWidth: stroke.card, borderBottomColor: color.ink, paddingBottom: 6 },
  tiles: { width: 160, gap: 6 },
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
  skills: { flex: 1, minWidth: 0, gap: 6 },
  group: { marginTop: 6, marginBottom: 2, backgroundColor: color.pop, borderWidth: 2, borderColor: color.ink },
  skill: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 46, borderBottomWidth: 1, borderBottomColor: color.separator },
  skillName: { width: 200 },
  skillTrack: { flex: 1 },
  skillN: { width: 150, alignItems: 'flex-end' },
  later: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  laterChip: { borderWidth: stroke.thin, borderColor: color.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  trophies: { width: 330, gap: 8 },
  medals: { flexDirection: 'row', gap: 6 },
  medal: { flex: 1, alignItems: 'center', gap: 2 },
  medalIcon: { width: 48, height: 48, borderRadius: 24, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.pop, alignItems: 'center', justifyContent: 'center' },
  medalEmoji: { fontSize: 22 },
  medalName: { fontSize: 12, fontWeight: '900', color: color.ink, textAlign: 'center' },
  proven: { fontSize: 11.5, fontWeight: '800', color: color.good },
  close: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { width: 300, gap: 6 },
  showoff: { width: 280, gap: 6 },
  comingUp: { gap: 12 },
  timeFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  lessons: { flex: 1, minWidth: 0, gap: 4 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' },
});
