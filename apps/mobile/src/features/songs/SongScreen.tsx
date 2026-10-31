// One song, on the shared player (D10, src/player): the web's src/youtube/SongView.tsx in the iPad landscape. The bar
// (‹, title, tempo, ⋯ with Versions), then the work: Set tempo, Learn by ear and Sheet music keep the video (official
// IFrame player) beside them; Jam and Play (scored) put the video on top and the music under it. Stage mode makes the
// video big. "Song audio (experimental)" is hidden on the iPad (B13).
import type { SoundId } from '@drum-coach/core/play/audioPort';
import { parseYouTubeId } from '@drum-coach/core/engine/youtube';
import type { YtResult } from '@drum-coach/core/youtube/schemas';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Body, Button, Card, CardTitle, Choice, Field, Screen, Small, Strong, Tabs, Warn, color, getAppHitBus, type, useAppSettings } from '../../ui';
import { getHomeServer } from '../../platform/api';
import { audio } from '../../platform/audio';
import { useAudioEngine } from '../../platform/useAudio';
import { getMidiPort } from '../../platform/midi';
import { YouTubeView, isRefused, useYt, watchUrl, type YtController } from '../../youtube';
import { Row } from './bits';
import { JamPanel } from './JamPanel';
import { LearnPanel } from './LearnPanel';
import type { ModeProps } from './modeProps';
import { SheetPages } from './SheetPart';
import { SHEET_EMPTY, SHEET_KEY } from './modes';
import { PlayPanel } from './PlayPanel';
import { findVersions } from './songsApi';
import {
  NOT_A_LINK, SPEEDS, VERSIONS_HINT, initialMode, modeTabs, needsTitle, shownMode, songBarCount, tempoLine,
  versionButtons, videoOf, type Mode, type SongBars, type Version,
} from './songsModel';
import { TempoPanel } from './TempoPanel';
import { KeysLine, PlayerFrame, PlayerSheet } from '../../player';
import { songsWrite, useSong } from './useSongs';

export function SongScreen({ id, bars }: { id: string; bars?: SongBars }) {
  const song = useSong(id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/songs'));
  if (!song) {
    return (
      <Screen withSidebar={false} testID="screen-song">
        <Stack.Screen options={{ headerShown: false }} />
        <Row><Button label="← Songs" onPress={back} testID="song-back" /></Row>
        <Card style={styles.gapTop}><CardTitle>Song not found</CardTitle><Small>It may have been removed. Pick one in Songs.</Small></Card>
      </Screen>
    );
  }
  return <SongView key={song.id} songId={song.id} bars={bars} onBack={back} />;
}

function SongView({ songId, bars, onBack }: { songId: string; bars?: SongBars; onBack: () => void }) {
  const song = useSong(songId)!;
  const [version, setVersion] = useState<Version>('originalId');
  const videoId = videoOf(song, version);
  const [mode, setMode] = useState<Mode>(() => initialMode(song, bars));
  const [rate, setRate] = useState(1);
  const [yt, setYt] = useState<YtController | null>(null);
  const [stage, setStage] = useState(false);
  const { latencyMs } = useAppSettings();
  useYt(yt);
  const port = getMidiPort();
  const now = useMemo(() => () => port.clock.now(), [port]);
  const bus = getAppHitBus();
  const sound = useCallback((sid: string, gain: number) => { audio.playNow(sid as SoundId, gain); }, []);
  useAudioEngine(); // the drum sounds and the click while the song is open, again after the app comes back (QA2 M2)

  // A song added from a pasted link takes the video's real title once the player knows it.
  const latest = useRef({ videoId, rate, song });
  useEffect(() => { latest.current = { videoId, rate, song }; });
  useEffect(() => {
    if (!yt) return;
    void yt.ready.then(() => { const s = latest.current.song; if (needsTitle(s, yt.title)) songsWrite(w => w.songs.patch(s.id, { title: yt.title.slice(0, 200) })); });
  }, [yt]);
  // Switching version: same player, new video, keep the chosen speed.
  const firstVideo = useRef(videoId);
  useEffect(() => {
    if (!yt) return;
    void yt.ready.then(() => {
      if (videoId !== firstVideo.current) yt.load(videoId);
      firstVideo.current = videoId;
      setRate(yt.setRate(latest.current.rate));
    });
  }, [videoId, yt]);
  useEffect(() => () => yt?.pause(), [yt]);

  const grid = song.grids[videoId];
  const shown = shownMode(song, videoId, mode);
  const props: ModeProps | null = yt ? { song, videoId, yt, rate, bars, now, bus, latencyMs, sound } : null;
  const onPlayer = useCallback((p: YtController) => setYt(p), []);
  const onStage = useCallback((on: boolean) => setStage(on), []);

  const [moreOpen, setMoreOpen] = useState(false);
  // Jam and Play (scored) play along with the video: YouTube on top, the music under it (D10); the work modes (tempo,
  // Learn by ear, sheet music) keep the video beside them. Stage mode makes the video big.
  const stacked = !stage && (shown === 'jam' || shown === 'play');
  const video = (
    <View style={stacked ? styles.videoTop : undefined}>
      <View style={[styles.video, stacked && styles.videoStacked]}>
        <YouTubeView videoId={videoId} now={now} onPlayer={onPlayer} style={StyleSheet.absoluteFill} testID="song-video" />
      </View>
      {yt?.error ? <Warn testID="song-video-error">{yt.error}</Warn> : null}
      {yt?.error && isRefused(yt.errorCode) ? (
        // YouTube won't play it in this player: watch it there instead (no song clock, so no scoring).
        <Button testID="song-open-youtube" emoji="▶" label="Open in YouTube" accessibilityLabel="Open this video in YouTube"
          onPress={() => { void Linking.openURL(watchUrl(videoId)).catch(() => {}); }} />
      ) : null}
      <Card style={stacked ? styles.transportStacked : undefined}>
        <Row>
          <Button testID="song-play-pause" tone="blue" label={yt?.playing ? 'Pause' : 'Play'} emoji={yt?.playing ? '⏸' : '▶'} disabled={!yt?.isReady}
            onPress={() => (yt?.playing ? yt.pause() : yt?.play())} />
          <Choice label="Speed" value={rate} options={SPEEDS.map(r => ({ value: r, label: `${r * 100}%` }))} onChange={r => yt && setRate(yt.setRate(r))} testID="song-speed" />
        </Row>
        {!stacked ? <Small style={styles.gapTop}>{tempoLine(song, videoId, rate)}</Small> : null}
      </Card>
    </View>
  );
  const panel = (
    <>
      <Tabs testID="song-mode" tabs={modeTabs(song, videoId)} value={shown} onChange={m => { yt?.pause(); setMode(m); }} />
      {props && shown === 'tempo' ? <TempoPanel {...props} /> : null}
      {props && grid && shown === 'learn' ? <LearnPanel key={videoId} {...props} /> : null}
      {props && grid && shown === 'jam' ? <JamPanel key={videoId} {...props} /> : null}
      {props && grid && shown === 'play' ? <PlayPanel key={videoId} {...props} onStage={onStage} /> : null}
      {grid && shown === 'sheet' ? (
        <Card testID="song-sheet-card">
          <CardTitle>Sheet music</CardTitle>
          {song.notes.length ? (
            <View style={styles.stackTop}>
              <SheetPages notes={song.notes} timeSignature={song.timeSignature} bars={songBarCount(song)} title={song.title} />
              <Small>{SHEET_KEY}</Small>
            </View>
          ) : <Small style={styles.gapTop}>{SHEET_EMPTY}</Small>}
        </Card>
      ) : null}
      {!props ? <Small>Loading the player…</Small> : null}
    </>
  );

  return (
    <View style={styles.fill} testID="screen-song">
      <Stack.Screen options={{ headerShown: false }} />
      <PlayerFrame
        phase="ready"
        testID="song"
        title={song.title}
        subtitle={tempoLine(song, videoId, rate)}
        onBack={onBack}
        onMore={() => setMoreOpen(true)}
        music={null}
        body={stacked ? (
          <ScrollView style={styles.fill} contentContainerStyle={styles.stack} keyboardShouldPersistTaps="handled">
            {video}
            {panel}
          </ScrollView>
        ) : (
          <View style={styles.cols}>
            <ScrollView style={stage ? styles.leftStage : styles.left} contentContainerStyle={styles.stack} keyboardShouldPersistTaps="handled">{video}</ScrollView>
            <ScrollView style={styles.right} contentContainerStyle={styles.stack} keyboardShouldPersistTaps="handled">{panel}</ScrollView>
          </View>
        )}
        overlayOpen={moreOpen}
      >
        <PlayerSheet open={moreOpen} onClose={() => setMoreOpen(false)} testID="song-more">
          {/* Versions moved here (D10); "Song audio (experimental)" is hidden on the iPad (TAB_CAPTURE, B13) */}
          <Versions songId={song.id} version={version} onVersion={v => { yt?.pause(); setVersion(v); }} />
          <KeysLine extra="Enter starts, Esc stops" />
        </PlayerSheet>
      </PlayerFrame>
    </View>
  );
}

function Versions({ songId, version, onVersion }: { songId: string; version: Version; onVersion: (v: Version) => void }) {
  const song = useSong(songId)!;
  const [found, setFound] = useState<{ drumless: YtResult[]; covers: YtResult[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  async function find() {
    setBusy(true); setError('');
    const r = await findVersions(getHomeServer(), song.title);
    setBusy(false);
    if (r.ok) setFound(r.data); else setError(r.error);
  }
  const use = (key: 'drumlessId' | 'coverId', vid: string) => {
    const r = songsWrite(s => s.songs.patch(song.id, { [key]: vid }));
    if (r.ok) onVersion(key); else setError(r.error);
  };
  return (
    <Card testID="song-versions">
      <CardTitle size={17}>Versions</CardTitle>
      <Row style={styles.gapTop}>
        {versionButtons(song).map(v => (
          <Button key={v.id} size="small" tone={version === v.id ? 'pop' : 'white'} label={v.label} disabled={v.disabled} onPress={() => onVersion(v.id)} testID={`song-version-${v.id}`} />
        ))}
        <Button size="small" label={busy ? 'Searching…' : 'Find drumless & covers'} disabled={busy} onPress={() => void find()} testID="song-versions-find" />
      </Row>
      <Small style={styles.gapTop}>{VERSIONS_HINT}</Small>
      <Row style={styles.gapTop}>
        <Field value={link} onChange={setLink} placeholder="…or paste a drumless video link" label="Drumless video link" style={styles.grow} testID="song-versions-link" />
        <Button label="Use" onPress={() => { const vid = parseYouTubeId(link); if (vid) { use('drumlessId', vid); setLink(''); } else setError(NOT_A_LINK); }} />
      </Row>
      {error ? <View style={styles.gapTop}><Warn>{error}</Warn></View> : null}
      {found ? (['drumless', 'covers'] as const).map(kind => (
        <View key={kind} style={styles.gapTop}>
          <Strong>{kind === 'drumless' ? 'Drumless versions' : 'Drum covers'}</Strong>
          {found[kind].slice(0, 5).map(r => (
            <View key={r.id} style={styles.found}>
              {r.thumbnail.startsWith('https://') ? <Image source={{ uri: r.thumbnail }} style={styles.thumb} /> : <View style={styles.thumb} />}
              <Body size={type.small} style={styles.grow} numberOfLines={2}>{r.title} · {r.channel}</Body>
              <Button size="small" label="Use" accessibilityLabel={`Use ${r.title}`} onPress={() => use(kind === 'drumless' ? 'drumlessId' : 'coverId', r.id)} />
            </View>
          ))}
        </View>
      )) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  videoTop: { alignItems: 'center', gap: 10 },
  videoStacked: { width: 560 },
  transportStacked: { alignSelf: 'center' },
  grow: { flex: 1, minWidth: 0 },
  cols: { flex: 1, flexDirection: 'row', gap: 18 },
  left: { width: 470, flexGrow: 0 },
  leftStage: { width: 720, flexGrow: 0 },
  right: { flex: 1 },
  stack: { gap: 14, paddingBottom: 30, paddingRight: 6 },
  stackTop: { gap: 10, marginTop: 10 },
  video: { width: '100%', aspectRatio: 16 / 9, borderWidth: 3, borderColor: color.ink, backgroundColor: '#000', boxShadow: '5px 5px 0px 0px #141414' },
  gapTop: { marginTop: 10 },
  found: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  thumb: { width: 80, height: 45, borderWidth: 2, borderColor: color.ink, backgroundColor: color.cream },
});
