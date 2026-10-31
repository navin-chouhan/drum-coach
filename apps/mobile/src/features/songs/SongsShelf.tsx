// The Songs shelf (D10: Songs is a shelf in Practice, not its own section): the web's src/youtube/SongsPage.tsx on the
// iPad. Search YouTube through the home server (or paste a link: that works without it), my songs, and "Import files
// instead". A song opens full screen (app/song/[id].tsx). Practice shows it under its Songs tile; the old Songs
// screen (SongsScreen.tsx) wraps it until the shell's routes move Songs under Practice.
import type { YtResult } from '@drum-coach/core/youtube/schemas';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Body, Button, Card, CardTitle, Field, ListRow, Small, Strong, Warn, color, type } from '../../ui';
import { getHomeServer } from '../../platform/api';
import { getStorage } from '../../platform/storage';
import { Row } from './bits';
import { ImportCard } from './ImportCard';
import { fmtDuration, searchYt } from './songsApi';
import { EMPTY_SONGS, SEARCH_PLACEHOLDER, searchAction, songHref, songRow } from './songsModel';
import { STORAGE_DOWN, songsStore, songsWrite, useYtSongs } from './useSongs';

export function SongsShelf({ style }: { style?: StyleProp<ViewStyle> }) {
  const songs = useYtSongs();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<YtResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showImport, setShowImport] = useState(false);
  const down = songsStore() ? '' : STORAGE_DOWN(getStorage().openError);
  const open = (id: string) => router.push(songHref(id));

  async function search() {
    const a = searchAction(q);
    if (a.kind === 'none') return;
    setError('');
    if (a.kind === 'add') { // pasted a link: add it directly
      const r = songsWrite(s => s.songs.add({ title: a.title, originalId: a.videoId }));
      if (!r.ok) { setError(r.error); return; }
      setResults(null); setQ('');
      open(r.value.id);
      return;
    }
    setBusy(true);
    const r = await searchYt(getHomeServer(), a.q);
    setBusy(false);
    if (r.ok) setResults(r.data); else setError(r.error);
  }
  function pick(r: YtResult) {
    const w = songsWrite(s => s.songs.add({ title: r.title.slice(0, 200), originalId: r.id }));
    if (!w.ok) { setError(w.error); return; }
    setResults(null);
    open(w.value.id);
  }
  function remove(id: string, question: string) {
    Alert.alert('Remove song', question, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { songsWrite(s => s.songs.remove(id)); } },
    ], { cancelable: true });
  }

  return (
    <View style={[styles.body, style]} testID="songs-shelf">
        {down ? <Warn testID="songs-storage-down">{down}</Warn> : null}
        <Card>
          <Row>
            <Field testID="songs-search" value={q} onChange={setQ} placeholder={SEARCH_PLACEHOLDER} label="Search YouTube" onSubmit={() => void search()} style={styles.grow} maxLength={300} />
            <Button testID="songs-search-go" tone="blue" label={busy ? 'Searching…' : 'Search'} disabled={busy} onPress={() => void search()} />
          </Row>
          {error ? <View style={styles.gap}><Warn testID="songs-error">{error}</Warn></View> : null}
        </Card>

        {results ? (
          <Card testID="songs-results">
            <Row style={styles.head}>
              <CardTitle>Results</CardTitle>
              <Button size="small" tone="plain" label="close" accessibilityLabel="Close the results" onPress={() => setResults(null)} />
            </Row>
            {results.length === 0 ? <Small>Nothing found.</Small> : null}
            {results.map((r, i) => (
              <View key={r.id} style={[styles.result, i > 0 && styles.sep]}>
                {r.thumbnail.startsWith('https://') ? <Image source={{ uri: r.thumbnail }} style={styles.thumb} accessibilityIgnoresInvertColors /> : <View style={styles.thumb} />}
                <View style={styles.grow}>
                  <Strong>{r.title}</Strong>
                  <Body size={type.small} color={color.muted}>{r.channel} · {fmtDuration(r.durationSec)}</Body>
                </View>
                <Button testID={`songs-learn-${r.id}`} label="Learn this" tone="pop" onPress={() => pick(r)} accessibilityLabel={`Learn ${r.title}`} />
              </View>
            ))}
          </Card>
        ) : null}

        <Card testID="songs-mine">
          <CardTitle>My songs</CardTitle>
          {songs.length === 0 ? <Small style={styles.gap}>{EMPTY_SONGS}</Small> : null}
          {songs.map((s, i) => {
            const row = songRow(s);
            return (
              <View key={s.id} style={styles.mine}>
                <View style={styles.grow}>
                  <ListRow first={i === 0} title={row.title} detail={row.detail} onPress={() => open(s.id)} testID={`songs-open-${s.id}`} accessibilityLabel={`Open ${row.title}. ${row.detail}`} />
                </View>
                <Button size="small" tone="blue" label="Open" onPress={() => open(s.id)} accessibilityLabel={`Open ${row.title}`} />
                <Button size="small" label="Remove" onPress={() => remove(s.id, row.removeQuestion)} accessibilityLabel={`Remove ${row.title}`} testID={`songs-remove-${s.id}`} />
              </View>
            );
          })}
        </Card>

        <Card tone="cream">
          <Row style={styles.head}>
            <CardTitle>Import files instead (drum MIDI + audio)</CardTitle>
            <Button testID="songs-import-toggle" size="small" label={showImport ? 'Hide' : 'Show'} onPress={() => setShowImport(x => !x)} accessibilityLabel={showImport ? 'Hide file import' : 'Show file import'} />
          </Row>
          {showImport ? <ImportCard /> : null}
        </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 18 },
  grow: { flex: 1, minWidth: 0 },
  gap: { marginTop: 10 },
  head: { justifyContent: 'space-between' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  sep: { borderTopWidth: 1, borderTopColor: color.separator },
  thumb: { width: 120, height: 68, backgroundColor: color.cream, borderWidth: 2, borderColor: color.ink },
  mine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
