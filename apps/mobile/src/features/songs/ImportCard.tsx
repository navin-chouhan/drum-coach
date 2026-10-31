// "Import files instead": the web's src/content/SongsView.tsx. A drum MIDI file becomes a chart in the library
// (charts table); backing audio, if given, is copied into the app's Documents and kept with it. Backing playback
// waits for A4's BackingPort (Phase 3b), so a chart with audio says so; everything else works.
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Body, Button, CardTitle, Field, ListRow, Panel, Small, Warn } from '../../ui';
import { Row } from './bits';
import { deleteBacking, isAudioName, pickAudio, pickMidi, saveBacking, type Picked } from './files';
import { IMPORT_HELP, LIBRARY_EMPTY, chartToSave, importSummary, libraryRow, parseMidiFile, type ParsedImport } from './importModel';
import { songsWrite, useStoredCharts } from './useSongs';

export function ImportCard() {
  const charts = useStoredCharts();
  const [parsed, setParsed] = useState<ParsedImport>();
  const [title, setTitle] = useState('');
  const [audio, setAudio] = useState<Picked>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onMidi() {
    setError(''); setParsed(undefined);
    try {
      const f = await pickMidi();
      if (!f) return;
      const r = parseMidiFile(f.bytes, f.name);
      if (!r.ok) { setError(r.error); return; }
      setParsed(r.parsed); setTitle(r.parsed.chart.title);
    } catch (e) { setError(`Couldn't open the file: ${e instanceof Error ? e.message : String(e)}`); }
  }
  async function onAudio() {
    setError('');
    try {
      const a = await pickAudio();
      if (!a) return;
      if (!isAudioName(a.name)) { setError('Send an MP3, OGG, WAV, FLAC or M4A file'); return; }
      setAudio(a);
    } catch (e) { setError(`Couldn't open the file: ${e instanceof Error ? e.message : String(e)}`); }
  }
  function save() {
    if (!parsed) return;
    setBusy(true); setError('');
    const r = songsWrite(s => {
      const c = s.charts.save(chartToSave(parsed, title), 'import');
      if (audio) {
        try { s.charts.setAudio(c.id, saveBacking(audio, c.id)); } catch (e) { throw new Error(`Audio upload failed: ${e instanceof Error ? e.message : String(e)}`); }
      }
      return c;
    });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    setParsed(undefined); setAudio(null);
  }
  function remove(id: string, question: string) {
    Alert.alert('Delete', question, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { const r = songsWrite(s => s.charts.remove(id)); if (r.ok) deleteBacking(r.value?.audioFile); } },
    ], { cancelable: true });
  }

  const sum = parsed && importSummary(parsed);
  const library = charts;
  return (
    <View style={styles.wrap}>
      <Panel style={styles.panel}>
        <CardTitle size={17}>Import a song</CardTitle>
        <Row>
          <Button testID="songs-import-midi" label="Drum MIDI file (.mid)" emoji="🥁" onPress={() => void onMidi()} />
          <Button testID="songs-import-audio" label={audio ? `Audio: ${audio.name}` : 'Backing audio, optional (MP3/OGG/WAV)'} emoji="🎵" onPress={() => void onAudio()} />
          {audio ? <Button size="small" tone="plain" label="no audio" onPress={() => setAudio(null)} accessibilityLabel="Drop the backing audio" /> : null}
        </Row>
        <Small>{IMPORT_HELP}</Small>
        {error ? <Warn testID="songs-import-error">{error}</Warn> : null}
        {parsed && sum ? (
          <View style={styles.parsed}>
            <Body weight="700">Title</Body>
            <Field testID="songs-import-title" value={title} onChange={setTitle} label="Title" maxLength={120} />
            <Small>{sum.line}</Small>
            <Small>{sum.counts}</Small>
            <Button testID="songs-import-save" tone="blue" label={busy ? 'Saving…' : 'Save to library'} disabled={busy} onPress={save} />
          </View>
        ) : null}
      </Panel>
      <Panel style={styles.panel}>
        <CardTitle size={17}>Your library</CardTitle>
        {library.length === 0 ? <Small>{LIBRARY_EMPTY}</Small> : null}
        {library.map((c, i) => {
          const row = libraryRow(c);
          return (
            <View key={c.id} style={styles.libRow}>
              <View style={styles.grow}><ListRow first={i === 0} title={row.title} detail={row.detail} compact /></View>
              <Button size="small" tone="blue" label="Play" accessibilityLabel={`Play ${row.title}`}
                onPress={() => router.push({ pathname: '/practice', params: { chartId: c.id } })} />
              <Button size="small" label="Delete" accessibilityLabel={`Delete ${row.title}`} onPress={() => remove(c.id, row.deleteQuestion)} />
            </View>
          );
        })}
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 14, marginTop: 12, alignItems: 'flex-start' },
  panel: { flex: 1, padding: 12, gap: 10 },
  parsed: { gap: 8 },
  libRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grow: { flex: 1, minWidth: 0 },
});
