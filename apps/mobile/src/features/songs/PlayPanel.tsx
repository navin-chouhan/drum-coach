// 4 · Play (scored) and Stage mode: the web's PlayMode. Your transcription on the note highway, synced to the video
// (the drumless version recommended), scored like any exercise and saved as a run. Stage mode (for playing in front
// of friends, always on in a concert): a big video and an encore instead of the score sheet; the concert offers the
// next song.
import { router } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BigMove, Body, Card, CardTitle, CheckRow, CoachLine, Display, Panel, Pill, Small, StatTile, Stepper, Warn, color, gesturesFor, readSettings, useAppKey, useAppSettings, useKitMoves,
} from '../../ui';
import { audio } from '../../platform/audio';
import { getHomeServer } from '../../platform/api';
import { NoteHighway } from '../../play';
import { NotationView } from '../../notation';
import { getStorage } from '../../platform/storage';
import { getCoach, replyFor, summarizeTake, thinkingAbout, useCoachSession } from '../coach';
import { SheetPager } from '../lesson/parts';
import { replayResults, takenChart } from '../lesson/runChart';
import { useSheetPages } from '../lesson/sheetPages';
import { askFeedback, coachEntry, onCoachEntries, type Feedback } from './coachAsk';
import { Row } from './bits';
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
  // a hardware keyboard: Enter starts, Esc stops (the web's Escape)
  useAppKey('enter', () => (playing ? false : go()));
  useAppKey('escape', () => (playing ? stop() : false));

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
      <SongTakeCoach f={done} songId={song.id} />
      <Row style={styles.gap}>
        <BigMove testID="song-results-again" tone="go" emoji="↻" label="Play again" gestures={gesturesFor('yes')} onPress={go} />
        <BigMove label="Back" onPress={() => setDone(null)} />
      </Row>
      <TakeSheet f={done} />
    </Card>
  );

  return (
    <Card testID="song-play" tone={stage ? 'cream' : 'white'}>
      <CardTitle>Play (scored)</CardTitle>
      {!playing ? (
        <View style={styles.stack}>
          <Small>{playHelp(videoId === song.drumlessId)}</Small>
          <Row>
            <Stepper label="Bars from" showLabel value={range.from} min={1} max={part.lastBar} onChange={v => setRange(r => ({ from: v, to: Math.max(v, r.to) }))} testID="song-play-from" />
            <Stepper label="to" showLabel value={range.to} min={range.from} max={part.lastBar} onChange={v => setRange(r => ({ ...r, to: v }))} testID="song-play-to" />
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

/**
 * The coach on a scored song take (the web's Results: coachTake once per take, its line, and "Detailed feedback and
 * a drill" from CoachFeedback). Offline, the coach shows the server-unreachable words; the score stays.
 */
function SongTakeCoach({ f, songId }: { f: SongTakeResult; songId: string }) {
  const coach = useCoachSession();
  const [opened] = useState(Date.now);
  useEffect(() => { void getCoach().session.coachTake(f, { chartId: songId }); }, [f, songId]);
  const reply = replyFor(coach, f, opened);
  const thinking = !reply && thinkingAbout(coach, f);
  const key = `song-take:${f.startedAt}`;
  const e = useSyncExternalStore(onCoachEntries, () => coachEntry<Feedback>(key));
  const ask = () => void askFeedback(getHomeServer(), key, summarizeTake(f, { chartId: songId }), async () => (await getStorage().coachContext('feedback')).context);
  return (
    <View style={styles.stack}>
      {reply ? <CoachLine size={18} testID="song-results-coach-line">{reply.show ?? reply.say}</CoachLine> : null}
      {thinking ? <View testID="song-results-coach-thinking"><Pill tone="pop">Coach is listening back…</Pill></View> : null}
      {!e && f.stats.total > 0 ? <BigMove testID="song-results-ask-coach" label="Detailed feedback and a drill" emoji="🥁" onPress={ask} /> : null}
      {e?.status === 'thinking' ? <Small>🤔 The coach is thinking…</Small> : null}
      {e?.status === 'error' ? <Warn>{e.error}</Warn> : null}
      {e?.status === 'done' ? (
        <Panel tone="cream" style={styles.coach} testID="song-results-feedback">
          <Body>{e.data.feedback}</Body>
          <Body weight="800">Drill: {e.data.drill.title}</Body>
          <Body>{e.data.drill.instructions}</Body>
        </Panel>
      ) : null}
    </View>
  );
}

/** The take on the sheet with its marks, every page of it (the web's Replay of expected vs played notes). */
function TakeSheet({ f }: { f: SongTakeResult }) {
  const settings = useAppSettings();
  const taken = useMemo(() => (f.results.length ? { chart: takenChart(f), results: replayResults(f) } : undefined), [f]);
  const pager = useSheetPages(taken);
  if (!taken) return null;
  return (
    <View style={styles.stack}>
      <View style={styles.sheet}>
        <NotationView chart={taken.chart} bpm={f.chart.bpm * f.options.speed} zero={f.zero} now={() => f.zero} latencyMs={0} results={taken.results}
          hints={settings.hints !== false} leftHanded={!!settings.leftHanded} page={pager.page} onPages={pager.setPages} testID="song-results-sheet" />
      </View>
      <SheetPager v={pager} onPrev={pager.prev} onNext={pager.next} tone="light" testID="song-results-pages" />
      <Body size={13} weight="800">● on it  ● early / late  ◌ missed  ✕ extra</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { height: 300, borderWidth: 3, borderColor: color.ink, overflow: 'hidden' },
  coach: { padding: 12, gap: 6 },
  gap: { marginTop: 12 },
  stack: { gap: 10, marginTop: 10 },
  highway: { height: 300, marginTop: 12, borderWidth: 3, borderColor: color.ink, overflow: 'hidden' },
  encore: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  tiles: { flexDirection: 'row', gap: 10, marginTop: 12 },
});
