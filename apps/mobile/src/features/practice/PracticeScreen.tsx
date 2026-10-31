// Practice, reorganised (D10, docs/mobile/reorg/practice-after.png): one job, pick and play. For you = 4 big cards (the
// warm-up first, then where you left off, your level, the coach's pick) with the yellow ring (ride × 2 moves it,
// hi-hat pedal × 3 plays it), the 3 moves, and 4 kind tiles; Songs is one of them (a shelf here, not a section).
// A tile opens its shelf below (Songs opens the Songs screen, a route under Practice); 🔎 searches every exercise;
// Metronome stays in the bar. Choosing opens the play screen
// (app/practice/play). The rules are in chooser.ts and catalog.ts.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getStorage } from '../../platform/storage';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BigMove, Body, Button, Card, Display, Label, ListRow, MAX_FONT_SCALE, Notice, RoundButton, Screen, TitleBar,
  color, gesturesFor, hardShadow, shadow, stroke, useAppSettings, useKitMoves,
} from '../../ui';
import { useStoredData } from '../progress/useStoredData';
import { useYtSongs } from '../songs/useSongs';
import { chartRow, listFor, requestedChart, type ChartRow, type TabId } from './catalog';
import { loadPracticeCharts } from './charts';
import { chooserModel, forYouCards, kindTiles, nextCard, playCardLabel, practiceLine, type ForYouCard, type KindTile } from './chooser';
import { practiceEngine } from './engine';
import { readPlayOptions, speedFor } from './play';

const openPlay = (id: string, extra: Record<string, string> = {}) => router.push({ pathname: '/practice/play', params: { chartId: id, ...extra } });

export function PracticeScreen() {
  const settings = useAppSettings();
  const { data } = useStoredData();
  const charts = useMemo(() => loadPracticeCharts(), [data]); // eslint-disable-line react-hooks/exhaustive-deps -- re-read with the runs
  const ytSongs = useYtSongs();
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
  const cards = useMemo(() => forYouCards(m), [m]);
  const [ring, setRing] = useState(0);
  const focus = Math.min(ring, Math.max(0, cards.length - 1));
  const focused: ForYouCard | undefined = cards[focus];
  const [shelf, setShelf] = useState<KindTile['id'] | undefined>();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState('');

  const eng = useSyncExternalStore(practiceEngine.subscribe, practiceEngine.get);
  const hearing = eng.demo && (eng.phase === 'playing' || eng.phase === 'starting');
  const hearRow = (row?: { id: string; startsAt: number }) => {
    if (hearing) { practiceEngine.stop(); return; }
    const c = row && charts.find(x => x.id === row.id);
    if (!c || !row) return;
    if (!practiceEngine.start({ chart: c, options: { ...readPlayOptions(getStorage().kv), chartId: c.id, speed: speedFor(row.startsAt, c.bpm), metronome: true, subdivision: 1, countInBars: 1, wait: false },
      section: null, demo: true, repeats: 1 })) setNotice(practiceEngine.notReady);
  };
  useFocusEffect(useCallback(() => () => practiceEngine.stop(), []));
  const warm = () => { if (m.warm) openPlay(m.warm.items[0].id, { warm: m.warm.items.map(w => w.id).join(','), bpm: String(m.warm.items[0].bpm) }); };
  const playCard = (c?: ForYouCard) => { if (!c) return; if (c.row) openPlay(c.row.id); else warm(); };
  const hearCard = (c?: ForYouCard) => hearRow(c?.row ?? (c && m.warm ? { id: m.warm.items[0].id, startsAt: m.warm.items[0].bpm } : undefined));
  const step = () => setRing(nextCard(focus, cards.length));
  useKitMoves({ yes: () => playCard(focused), next: step, listen: () => hearCard(focused), faster: warm });

  const tiles = useMemo(() => kindTiles(charts, ytSongs.length), [charts, ytSongs.length]);
  const allRows = useMemo(() => new Map(charts.map(c => [c.id, chartRow(c, data?.runs ?? [], m.read)])), [charts, data, m.read]);
  const query = searching ? q.trim() : '';
  const listTab: TabId | undefined = query ? 'foryou' : shelf && shelf !== 'song' ? shelf : undefined;
  const rows = useMemo(() => (listTab ? listFor(charts, listTab, query).map(c => allRows.get(c.id)!) : []), [charts, listTab, query, allRows]);
  const half = Math.ceil(rows.length / 2);
  const openTile = (id: KindTile['id']) => {
    if (id === 'song') { router.navigate('/songs'); return; } // the Songs shelf is its own route under Practice (R1)
    setShelf(s => (s === id ? undefined : id)); setSearching(false); setQ('');
  };

  return (
    <Screen testID="screen-practice">
      <TitleBar title="Practice" coach={practiceLine(cards)} right={<View style={styles.topRight}>
        <Button label="Metronome" emoji="🔔" size="small" testID="practice-metronome" onPress={() => router.push('/practice/metronome')} />
        <RoundButton glyph="🔎" label={searching ? 'Close the search' : 'Search exercises'} onPress={() => { setSearching(x => !x); setQ(''); }} testID="practice-search-open" />
      </View>} />
      {searching ? (
        <View style={styles.search}>
          <Text style={styles.searchIcon} accessible={false}>🔎</Text>
          <TextInput testID="practice-search" value={q} onChangeText={setQ} placeholder={`Search ${m.total} exercises`} placeholderTextColor={color.muted} autoFocus
            accessibilityLabel="Search exercises" style={styles.searchInput} maxFontSizeMultiplier={MAX_FONT_SCALE} returnKeyType="search" clearButtonMode="while-editing" />
        </View>
      ) : null}

      <View style={styles.forHead}><Label>For you</Label></View>
      <View style={styles.cards4}>
        {cards.length === 0 ? <Body weight="700">Play a couple of exercises from the kinds below and your picks show up here.</Body> : null}
        {cards.map((c, i) => (
          <Card key={c.key} tone={focus === i ? 'white' : 'cream'} elevation={5} onPress={() => playCard(c)} testID={c.key === 'warm' ? 'practice-warmup' : `practice-card-${i}`}
            accessibilityLabel={`${c.title}, ${c.tag}, ${c.line}`} style={[styles.fy, focus === i && styles.ring]}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.tag, c.ai && styles.tagCoach]}>{c.tag}</Text>
            <Text style={styles.cardIcon} accessible={false}>{c.icon}</Text>
            <Display size={21} numberOfLines={2}>{c.title}</Display>
            <Body size={14} weight="700" color={color.muted} numberOfLines={1} style={styles.fyMeta}>{c.line}</Body>
          </Card>
        ))}
      </View>

      <View style={styles.moves}>
        <BigMove tone="go" label={playCardLabel(focused)} emoji="▶" gestures={gesturesFor('yes')} onPress={() => playCard(focused)} disabled={!focused} testID="practice-play" style={styles.moveGo} />
        <BigMove label={hearing ? 'Stop' : 'Hear it'} emoji={hearing ? '■' : '👂'} gestures={gesturesFor('listen')} onPress={() => hearCard(focused)} disabled={!focused} testID="practice-hear" style={styles.move} />
        <BigMove tone="alt" label="Next card" emoji="⏭" gestures={gesturesFor('next')} onPress={step} disabled={cards.length < 2} testID="practice-next" style={styles.move} />
      </View>
      {notice ? <Notice text={notice} onClose={() => setNotice('')} /> : null}

      <View style={styles.kinds} accessibilityRole="tablist" testID="practice-kinds">
        {tiles.map(t => (
          <Card key={t.id} tone={shelf === t.id ? 'pop' : 'white'} elevation={5} onPress={() => openTile(t.id)} testID={`practice-kind-${t.id}`}
            accessibilityLabel={`${t.label}, ${t.count}`} style={styles.kind}>
            <Text style={styles.kindIcon} accessible={false}>{t.icon}</Text>
            <Display size={18} numberOfLines={1} style={styles.kindLabel}>{t.label}</Display>
            <Body size={13.5} weight="800" color={color.muted} numberOfLines={2} style={styles.kindCount}>{t.count}</Body>
          </Card>
        ))}
      </View>

      {listTab ? (
        <ScrollView style={styles.listArea} contentContainerStyle={styles.cols} keyboardShouldPersistTaps="handled">
          {rows.length === 0 ? <Body color={color.ink} weight="700" style={styles.empty}>Nothing here yet.</Body>
            : [rows.slice(0, half), rows.slice(half)].map((col, k) => (
              <Card key={k} style={styles.group} elevation={4}>
                {col.map((r: ChartRow, i) => (
                  <ListRow key={r.id} first={i === 0} title={r.title} detail={r.plays} onPress={() => openPlay(r.id)} testID={`practice-row-${r.id}`}
                    accessibilityLabel={`${r.title}: ${r.bestWords}`}
                    lead={<View style={styles.sym}><Text style={styles.symText}>{r.icon}</Text></View>}
                    value={<Text style={styles.best}>{r.best ? <>best clean <Text style={styles.bestN}>{r.best}</Text></> : r.bestWords}  ›</Text>} />
                ))}
              </Card>
            ))}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  search: { alignSelf: 'flex-end', width: 360, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, marginTop: 8, borderRadius: 999, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, boxShadow: hardShadow(shadow.button) },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: color.ink, height: 40 },
  forHead: { flexDirection: 'row', marginTop: 14, marginBottom: 6 },
  cards4: { flexDirection: 'row', gap: 16 },
  fy: { flex: 1, minWidth: 0, minHeight: 176, paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
  ring: { outlineWidth: 6, outlineColor: color.pop, outlineStyle: 'solid', outlineOffset: 0 },
  tag: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', backgroundColor: color.night, color: color.white },
  tagCoach: { backgroundColor: color.panel, color: color.ink, borderWidth: 2, borderStyle: 'dashed', borderColor: color.ink },
  cardIcon: { fontSize: 38, lineHeight: 44 },
  fyMeta: { marginTop: 'auto' },
  moves: { flexDirection: 'row', gap: 16, marginTop: 18 },
  moveGo: { flex: 2, minHeight: 100 },
  move: { flex: 1, minHeight: 100 },
  kinds: { flexDirection: 'row', gap: 16, marginTop: 20 },
  kind: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingVertical: 10, paddingHorizontal: 14 },
  kindIcon: { fontSize: 26 },
  kindLabel: { flexShrink: 0 },
  kindCount: { flexShrink: 1, marginLeft: 'auto', textAlign: 'right' },
  listArea: { flex: 1, marginTop: 16, marginHorizontal: -8 },
  cols: { flexDirection: 'row', gap: 18, paddingHorizontal: 8, paddingBottom: 10, alignItems: 'flex-start' },
  group: { flex: 1, minWidth: 0, paddingVertical: 0, paddingHorizontal: 0 },
  sym: { width: 32, height: 32, backgroundColor: color.teal, borderWidth: stroke.thin, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  symText: { fontSize: 17 },
  best: { fontSize: 13.5, fontWeight: '700', color: color.muted },
  bestN: { fontWeight: '900', color: color.ink },
  empty: { paddingVertical: 8 },
});
