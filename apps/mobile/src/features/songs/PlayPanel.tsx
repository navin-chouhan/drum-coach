// 4 · Play (scored) and Stage mode: the web's PlayMode. Your transcription on the note highway, synced to the video
// (the drumless version recommended), scored like any exercise and saved as a run. Stage mode (for playing in front
// of friends, always on in a concert): a big video and an encore instead of the score sheet; the concert offers the
// next song.
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigMove, Body, Card, CardTitle, Display, StatTile, color, gesturesFor, readSettings, useKitMoves } from '../../ui';
import { audio } from '../../platform/audio';
import { NoteHighway } from '../../play';
import { getStorage } from '../../platform/storage';
import { CheckRow, Row, Small, Stepper } from './bits';
import { PLAY_EMPTY, STAGE_LABEL, playHelp, songPart, songTakeOptions } from './modes';
import type { ModeProps } from './modeProps';
import { concert, songHref } from './songsModel';
import { createSongTake, songRun, type SongTake, type SongTakeResult } from './songTake';
import { useInterruptions } from './useInterruptions';

export function PlayPanel({ song, videoId, yt, rate, bars, bus, now, onStage }: ModeProps & { onStage: (on: boolean) => void }) {
  const grid = song.grids[videoId];
  const part = songPart(song, grid);
  const [range, setRange] = useState(bars ?? { from: part.firstBar, to: part.lastBar });
  const [stage, setStage] = useState(concert.queue.length > 0);
  const [take, setTake] = useState<SongTake | null>(null);
  const [done, setDone] = useState<SongTakeResult | null>(null);
  const next = concert.queue[0];
  useEffect(() => { onStage(stage); }, [stage, onStage]);
  useEffect(() => () => { take?.stop(); }, [take]);

  function go() {
    take?.stop();
    setDone(null);
    const { chart, opts } = songTakeOptions({ s: song, g: grid, yt, range, rate });
    const t = createSongTake({
      clock: { now }, audio, onHit: fn => bus.onHit(fn),
      settings: () => { const st = readSettings(getStorage().kv); return { latencyMs: st.latencyMs, countIn: st.countIn, liveTips: st.liveTips, chattiness: st.chattiness }; },
      every: (ms, fn) => { const id = setInterval(fn, ms); return () => clearInterval(id); },
    }, chart, opts);
    t.onFinish(r => {
      setDone(r); setTake(null);
      void getStorage().runs.add(songRun(r, song.title, song.id)).catch(() => {});
    });
    setTake(t);
    void t.start();
  }
  const stop = () => { take?.stop(); setTake(null); };
  const playing = !!take;
  // D6: a call or the app leaving the foreground ends the take; ≥ 2 whole bars are kept, flagged (onFinish saves it)
  useInterruptions(playing, at => { take?.interrupt(at); setTake(null); });
  useKitMoves({ yes: () => (playing ? undefined : go()), stop: () => (playing ? stop() : undefined) }, { playing });

  // The highway runs on the song: its clock is the take's run ms, beat 0 at 0.
  const runNow = useMemo(() => (take ? () => take.runMs(now()) : now), [take, now]);

  if (!song.notes.some(n => n.t >= 0)) return <Card><CardTitle>Play (scored)</CardTitle><Small style={styles.gap}>{PLAY_EMPTY}</Small></Card>;

  if (done && stage) return (
    <Card tone="night" testID="song-encore" style={styles.encore}>
      <Display size={64} color={color.pop}>ENCORE!</Display>
      <Display size={28} color={color.white}>{song.title}</Display>
      <Body color={color.white}>{done.stats.accuracy}% on time</Body>
      <Row>
        {next ? <BigMove testID="song-encore-next" tone="go" emoji="▶" label="Next song" gestures={gesturesFor('yes')}
          onPress={() => { concert.queue.shift(); router.replace(songHref(next.id, next.bars)); }} />
          : <BigMove testID="song-encore-again" tone="go" emoji="↻" label="Play it again" gestures={gesturesFor('yes')} onPress={go} />}
        <BigMove label="Back" onPress={() => { concert.queue = []; setDone(null); }} />
      </Row>
    </Card>
  );

  if (done) return (
    <Card testID="song-results">
      <CardTitle>Play (scored): bars {done.options.fromBar}–{done.options.toBar}</CardTitle>
      <View style={styles.tiles}>
        <StatTile value={`${done.stats.accuracy}%`} label="on time" />
        <StatTile value={`${done.stats.meanOffset > 0 ? '+' : ''}${done.stats.meanOffset} ms`} label="early (−) / late (+)" />
        <StatTile value={`±${done.stats.spread} ms`} label="consistency" />
        <StatTile value={String(done.stats.extra)} label="extra strokes" />
      </View>
      <Row style={styles.gap}>
        <BigMove testID="song-results-again" tone="go" emoji="↻" label="Play again" gestures={gesturesFor('yes')} onPress={go} />
        <BigMove label="Back" onPress={() => setDone(null)} />
      </Row>
    </Card>
  );

  return (
    <Card testID="song-play" tone={stage ? 'cream' : 'white'}>
      <CardTitle>Play (scored)</CardTitle>
      {!playing ? (
        <View style={styles.stack}>
          <Small>{playHelp(videoId === song.drumlessId)}</Small>
          <Row>
            <Stepper label="Bars from" value={range.from} max={part.lastBar} onChange={v => setRange(r => ({ from: v, to: Math.max(v, r.to) }))} testID="song-play-from" />
            <Stepper label="to" value={range.to} min={range.from} max={part.lastBar} onChange={v => setRange(r => ({ ...r, to: v }))} testID="song-play-to" />
          </Row>
          <CheckRow label={STAGE_LABEL} value={stage} onChange={setStage} testID="song-play-stage" />
        </View>
      ) : null}
      <BigMove testID="song-play-go" tone="go" emoji={playing ? '■' : '▶'} label={playing ? 'Stop' : 'Start'} gestures={gesturesFor(playing ? 'stop' : 'yes')}
        onPress={playing ? stop : go} style={styles.gap} />
      {take ? (
        <View style={styles.highway}>
          <NoteHighway chart={take.runChart} bpm={60000 / take.beatMs} zero={0} now={runNow} latencyMs={0} results={take.results} testID="song-play-highway" />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 12 },
  stack: { gap: 10, marginTop: 10 },
  highway: { height: 300, marginTop: 12, borderWidth: 3, borderColor: color.ink, overflow: 'hidden' },
  encore: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
