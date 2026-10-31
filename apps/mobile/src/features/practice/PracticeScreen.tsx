// Practice (docs/mockups/ipad/practice.html): pick up where you left off, the warm-up, For you with the yellow ring
// (ride × 2 moves it, hi-hat pedal × 3 plays it), and the library by kind with your best clean tempo. Choosing opens
// the play screen (app/practice/play). The rules are in chooser.ts and catalog.ts.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getStorage } from '../../platform/storage';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BigMove, Body, Button, Card, Display, GestureChip, Label, ListRow, MAX_FONT_SCALE, Panel, Pill, Screen, Segmented, TitleBar,
  color, gesturesFor, hardShadow, shadow, stroke, useAppSettings, useKitMoves,
  Notice,
} from '../../ui';
import { useStoredData } from '../progress/useStoredData';
import { chartRow, listFor, requestedChart, type ChartRow, type TabId } from './catalog';
import { loadPracticeCharts } from './charts';
import { chooserModel, focusedRow, initialFocus, playLabel, stepFocus } from './chooser';
import { practiceEngine } from './engine';
import { readPlayOptions, speedFor } from './play';

const openPlay = (id: string, extra: Record<string, string> = {}) => router.push({ pathname: '/practice/play', params: { chartId: id, ...extra } });

export function PracticeScreen() {
  const settings = useAppSettings();
  const { data } = useStoredData();
  const charts = useMemo(() => loadPracticeCharts(), [data]); // eslint-disable-line react-hooks/exhaustive-deps -- re-read with the runs
  // `?chartId=` (Songs' Play, as the web's pending chart): open that exercise's play screen, once per request.
  const params = useLocalSearchParams<{ chartId?: string; bpm?: string }>();
  useEffect(() => {
    if (!params.chartId) return;
    // read anew: a song imported since this tab was last shown isn't in `charts` yet (they follow the runs)
    const c = requestedChart(loadPracticeCharts(), params.chartId);
    router.setParams({ chartId: undefined, bpm: undefined });
    if (c) openPlay(c.id, params.bpm ? { bpm: params.bpm } : {});
  }, [params.chartId]); // eslint-disable-line react-hooks/exhaustive-deps -- once per request
  const m = useMemo(() => chooserModel({ charts, runs: data?.runs ?? [], progress: settings.lessons, profile: settings.profile, lessons: data?.lessons ?? [] }),
    [charts, data, settings.lessons, settings.profile]);
  const [picked, setFocus] = useState<number>();
  const focus = picked ?? initialFocus(m);
  const focused = focusedRow(focus, m);
  const [tab, setTab] = useState<TabId>('foryou');
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState('');

  const play = (row?: ChartRow) => { if (row) openPlay(row.id); };
  const eng = useSyncExternalStore(practiceEngine.subscribe, practiceEngine.get);
  const hearing = eng.demo && (eng.phase === 'playing' || eng.phase === 'starting');
  const hear = (row?: ChartRow) => {
    if (hearing) { practiceEngine.stop(); return; }
    const c = row && charts.find(x => x.id === row.id);
    if (!c || !row) return;
    if (!practiceEngine.start({ chart: c, options: { ...readPlayOptions(getStorage().kv), chartId: c.id, speed: speedFor(row.startsAt, c.bpm), metronome: true, subdivision: 1, countInBars: 1, wait: false },
      section: null, demo: true, repeats: 1 })) setNotice(practiceEngine.notReady);
  };
  useFocusEffect(useCallback(() => () => practiceEngine.stop(), []));
  const warm = () => { if (m.warm) openPlay(m.warm.items[0].id, { warm: m.warm.items.map(w => w.id).join(','), bpm: String(m.warm.items[0].bpm) }); };
  const step = () => setFocus(stepFocus(focus, m));
  useKitMoves({ yes: () => play(focused), next: step, listen: () => hear(focused), faster: warm });

  const allRows = useMemo(() => new Map(charts.map(c => [c.id, chartRow(c, data?.runs ?? [], m.read)])), [charts, data, m.read]);
  const rows = useMemo(() => listFor(charts, tab, q).map(c => allRows.get(c.id)!), [charts, tab, q, allRows]);
  const half = Math.ceil(rows.length / 2);

  return (
    <Screen testID="screen-practice">
      <TitleBar title="Practice" right={<View style={styles.topRight}>
        <Button label="Metronome" emoji="🔔" size="small" testID="practice-metronome" onPress={() => router.push('/practice/metronome')} />
        <View style={styles.search}>
          <Text style={styles.searchIcon} accessible={false}>🔎</Text>
          <TextInput testID="practice-search" value={q} onChangeText={setQ} placeholder={`Search ${m.total} exercises`} placeholderTextColor={color.muted}
            accessibilityLabel="Search exercises" style={styles.searchInput} maxFontSizeMultiplier={MAX_FONT_SCALE} returnKeyType="search" clearButtonMode="while-editing" />
        </View>
      </View>} />

      <View style={styles.row1}>
        <Card style={[styles.last, focus < 0 && styles.ring]} testID="practice-resume">
          {m.resume ? (
            <Panel tone="pop" style={styles.lastTop}>
              <Text style={styles.bigIcon} accessible={false}>{m.resume.icon}</Text>
              <View style={styles.lastText}>
                <Label>{`Pick up where you left off · ${m.resume.kicker}`}</Label>
                <Display size={27} numberOfLines={1}>{m.resume.title}</Display>
                {m.resume.description ? <Body numberOfLines={1}>{m.resume.description}</Body> : null}
                <View style={styles.pills}>
                  <Pill emoji="⏱">{`starts at ${m.resume.startsAt} today`}</Pill>
                  {m.resume.best > 0 ? <Pill emoji="⭐" tone="green">{`best clean: ${m.resume.best} BPM`}</Pill> : null}
                  {m.resume.ai ? <Pill>✍ by your coach</Pill> : null}
                </View>
              </View>
            </Panel>
          ) : (
            <Panel tone="pop" style={styles.lastTop}>
              <Body size={17}>Pick something below. <Text style={styles.b}>Ride × 2</Text> moves the yellow ring, <Text style={styles.b}>hi-hat pedal × 3</Text> plays it.</Body>
            </Panel>
          )}
          <View style={styles.moves}>
            <BigMove tone="go" label={playLabel(focus, m).replace(/^▶ /, '')} emoji="▶" gestures={gesturesFor('yes')} onPress={() => play(focused)} disabled={!focused} testID="practice-play" style={styles.moveGo} />
            <BigMove label={hearing ? 'Stop' : 'Hear it'} emoji={hearing ? '■' : '👂'} gestures={gesturesFor('listen')} onPress={() => hear(focused)} disabled={!focused} testID="practice-hear" style={styles.move} />
            <BigMove label="Next card" emoji="⏭" gestures={gesturesFor('next')} onPress={step} testID="practice-next" style={styles.move} />
          </View>
          {notice ? <Notice text={notice} onClose={() => setNotice('')} /> : null}
        </Card>

        <Card tone="night" style={styles.warm} testID="practice-warmup">
          <Label tone="pop">{`🔥 ${m.warm?.title ?? 'Warm-up'}`}</Label>
          {m.warm ? <>
            <Body size={13.5} color="#ddd">A few short exercises, one after the other, at the tempos For you picks. Just loosen up.</Body>
            <View>
              {m.warm.items.map((w, i) => (
                <View key={w.id} style={[styles.warmRow, i > 0 && styles.warmSep]}>
                  <Body size={14.5} weight="700" color={color.white} numberOfLines={1} style={styles.grow}>{w.title}</Body>
                  <Body size={13.5} color="#ccc">{`${w.minutes} min · ${w.bpm}`}</Body>
                </View>
              ))}
            </View>
            <BigMove label="Start the warm-up" emoji="▶" tone="white" gestures={gesturesFor('faster')} onPress={warm} testID="practice-warm-start" style={styles.warmGo} />
          </> : <Body size={13.5} color="#ddd">Play a couple of exercises and a warm-up from them shows up here.</Body>}
        </Card>
      </View>

      <View style={styles.forHead}>
        <View style={styles.forTitle}><Display size={20}>For you</Display></View>
        <GestureChip gesture={gesturesFor('next')[0]} /><Body size={13.5} weight="800">moves the ring</Body>
        <GestureChip gesture={gesturesFor('yes')[0]} /><Body size={13.5} weight="800">plays it</Body>
      </View>
      <View style={styles.cards4}>
        {m.cards.map((c, i) => (
          <Card key={c.id} tone={focus === i ? 'white' : 'cream'} elevation={4} onPress={() => play(c)} testID={`practice-card-${i}`}
            accessibilityLabel={`${c.title}, ${c.why}, ${c.plays}`} style={[styles.fy, focus === i && styles.ring]}>
            {c.why ? <Text style={[styles.tag, c.ai && styles.tagCoach]}>{c.ai ? `✍ ${c.why}` : c.why}</Text> : null}
            <Display size={16} numberOfLines={2}>{c.title}</Display>
            <Body size={13} weight="700" color={color.muted} numberOfLines={1} style={styles.fyMeta}>{`starts at ${c.startsAt} · ${c.bars} bar${c.bars === 1 ? '' : 's'}`}</Body>
          </Card>
        ))}
        <Card tone="cream" elevation={4} style={styles.fy} testID="practice-all" accessibilityLabel={`All exercises: ${m.allLine}`}
          onPress={() => { const first = m.segments.find(s => s.id !== 'foryou'); if (first) setTab(first.id); }}>
          <Display size={16}>＋ All exercises</Display>
          <Body size={12.5} weight="700" color={color.muted} numberOfLines={2} style={styles.fyMeta}>{m.allLine}</Body>
        </Card>
      </View>

      <View style={styles.lib}>
        <Segmented testID="practice-kinds" accessibilityLabel="Exercises by kind" value={q.trim() ? ('' as TabId) : tab} onChange={v => { setTab(v); setQ(''); }}
          options={m.segments.map(s => ({ value: s.id, label: s.label, count: s.count }))} />
      </View>
      <ScrollView style={styles.listArea} contentContainerStyle={styles.cols}>
        {rows.length === 0 ? (
          <Body color={color.ink} weight="700" style={styles.empty}>{q.trim() || tab !== 'foryou' ? 'Nothing here yet.' : 'Your picks are the cards above. Choose a kind to see them all.'}</Body>
        ) : [rows.slice(0, half), rows.slice(half)].map((col, k) => (
          <Card key={k} style={styles.group} elevation={4}>
            {col.map((r, i) => (
              <ListRow key={r.id} first={i === 0} title={r.title} detail={r.plays} onPress={() => play(r)} testID={`practice-row-${r.id}`}
                accessibilityLabel={`${r.title}: ${r.bestWords}`}
                lead={<View style={styles.sym}><Text style={styles.symText}>{r.icon}</Text></View>}
                value={<Text style={styles.best}>{r.best ? <>best clean <Text style={styles.bestN}>{r.best}</Text></> : r.bestWords}  ›</Text>} />
            ))}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  search: { width: 280, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, boxShadow: hardShadow(shadow.button) },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: color.ink, height: 40 },
  row1: { flexDirection: 'row', gap: 18 },
  last: { flex: 1, minWidth: 0, gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  ring: { outlineWidth: 5, outlineColor: color.pop, outlineStyle: 'solid', outlineOffset: 2 },
  lastTop: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 14, minHeight: 112 },
  bigIcon: { fontSize: 50 },
  lastText: { flex: 1, minWidth: 0, gap: 3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  b: { fontWeight: '900' },
  moves: { flexDirection: 'row', gap: 14 },
  moveGo: { flex: 2.1, minHeight: 92 },
  move: { flex: 1, minHeight: 92 },
  warm: { width: 286, gap: 8, paddingVertical: 12, paddingHorizontal: 14 },
  warmRow: { flexDirection: 'row', alignItems: 'center', minHeight: 31, gap: 8 },
  warmSep: { borderTopWidth: 1, borderTopColor: '#ffffff2a' },
  grow: { flex: 1, minWidth: 0 },
  warmGo: { marginTop: 'auto', minHeight: 72, backgroundColor: color.pop },
  forHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 10 },
  forTitle: { backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, boxShadow: hardShadow(3), paddingHorizontal: 10, paddingVertical: 3, marginRight: 6 },
  cards4: { flexDirection: 'row', gap: 16 },
  fy: { flex: 1, minWidth: 0, height: 98, paddingVertical: 9, paddingHorizontal: 12, gap: 4 },
  fyMeta: { marginTop: 'auto' },
  tag: { alignSelf: 'flex-start', fontSize: 11.5, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 1, borderRadius: 999, overflow: 'hidden', backgroundColor: color.night, color: color.white },
  tagCoach: { backgroundColor: color.panel, color: color.ink, borderWidth: 2, borderStyle: 'dashed', borderColor: color.ink },
  lib: { marginTop: 16, marginBottom: 10 },
  listArea: { flex: 1, marginHorizontal: -8 },
  cols: { flexDirection: 'row', gap: 18, paddingHorizontal: 8, paddingBottom: 10, alignItems: 'flex-start' },
  group: { flex: 1, minWidth: 0, paddingVertical: 0, paddingHorizontal: 0 },
  sym: { width: 32, height: 32, backgroundColor: color.teal, borderWidth: stroke.thin, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  symText: { fontSize: 17 },
  best: { fontSize: 13.5, fontWeight: '700', color: color.muted },
  bestN: { fontWeight: '900', color: color.ink },
  empty: { paddingVertical: 8 },
});
