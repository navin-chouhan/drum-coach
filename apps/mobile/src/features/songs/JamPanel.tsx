// 3 · Jam: the web's JamMode. Play anything that fits the song; you're scored against the song's beat (no chart):
// timing, consistency, drift and per-drum dynamics. The jam is saved as a run; the coach can comment on it.
import type { JamHit, JamStats } from '@drum-coach/core/engine/jam';
import { PAD_INFO, type PadId } from '@drum-coach/core/engine/kit';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigMove, Body, Card, CardTitle, Choice, Display, Panel, Small, StatTile, Warn, color, gesturesFor, tabular, type, useAppKey, useKitMoves } from '../../ui';
import { getHomeServer } from '../../platform/api';
import { getStorage } from '../../platform/storage';
import { askFeedback, coachEntry, onCoachEntries, type Feedback } from './coachAsk';
import { JAM_HELP, JAM_STEPS, jamBand, jamLive, jamOffset, jamResultTiles, jamRun, jamStartAt, jamSummary, scoreJamTake, timing } from './modes';
import type { ModeProps } from './modeProps';
import { jamKeepsInterrupted } from './interrupt';
import { useInterruptions } from './useInterruptions';

const BAND = { none: color.ink, good: color.good, ok: color.ok, bad: color.bad } as const;

export function JamPanel({ song, videoId, yt, rate, bus, latencyMs, now }: ModeProps) {
  const grid = song.grids[videoId];
  const [steps, setSteps] = useState<number>(2);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ stats: JamStats; at: string } | null>(null);
  const [live, setLive] = useState<number[]>([]);
  const hits = useRef<JamHit[]>([]);
  const started = useRef({ at: '', ms: 0 });

  useEffect(() => {
    if (!running) return;
    return bus.onHit(h => {
      if (!h.pad || !yt.playing) return;
      const songSec = yt.songTime(h.time - latencyMs);
      hits.current.push({ songSec, pad: h.pad, velocity: h.velocity });
      setLive(l => [...l.slice(-15), jamOffset(songSec, grid, steps, rate)]);
    });
  }, [running, yt, grid, steps, rate, bus, latencyMs]);

  function start() {
    hits.current = []; setLive([]); setResult(null);
    started.current = { at: new Date().toISOString(), ms: now() };
    const from = jamStartAt(yt.songTime(), yt.duration);
    if (from !== null) yt.seek(from);
    yt.play(); setRunning(true);
  }
  /** `interrupted` (D6): a call or the app leaving the foreground; kept, flagged, only after ≥ 2 whole bars. */
  function stop(interrupted = false) {
    yt.pause(); setRunning(false);
    const playedMs = now() - started.current.ms;
    const stats = interrupted && !jamKeepsInterrupted(song, grid, rate, playedMs) ? null : scoreJamTake(hits.current, grid, steps, rate);
    if (!stats) { setResult(null); return; }
    const durationS = Math.round(playedMs / 1000);
    setResult({ stats, at: started.current.at });
    void getStorage().runs.add(jamRun(song, grid, rate, stats, started.current.at, durationS, interrupted)).catch(() => {});
  }
  useInterruptions(running, () => stop(true));
  useEffect(() => () => yt.pause(), [yt]);
  useKitMoves({ yes: () => (running ? undefined : start()), stop: () => (running ? stop() : undefined) }, { playing: running });
  useAppKey('enter', () => (running ? false : start()));
  useAppKey('escape', () => (running ? stop() : false));

  const last = live[live.length - 1];
  return (
    <Card testID="song-jam">
      <CardTitle>Jam along</CardTitle>
      <Small style={styles.gap}>{JAM_HELP}</Small>
      <View style={styles.gap}><Choice label="Compare with" value={steps} options={JAM_STEPS} onChange={setSteps} disabled={running} testID="song-jam-steps" /></View>
      <BigMove testID="song-jam-go" tone="go" emoji={running ? '■' : '▶'} label={running ? 'Stop & score' : 'Start jamming'}
        gestures={gesturesFor(running ? 'stop' : 'yes')} onPress={running ? () => stop() : start} style={styles.go} />
      {running ? (
        <View style={styles.gap} accessibilityLiveRegion="polite">
          <Display size={44} color={BAND[jamBand(last)]} style={tabular}>{jamLive(last)}</Display>
          <View style={styles.meter} accessibilityElementsHidden>
            <View style={styles.zone} /><View style={styles.center} />
            {live.map((o, i) => <View key={i} style={[styles.tick, { left: `${50 + Math.max(-49, Math.min(49, o / 2))}%`, opacity: 0.2 + (0.8 * (i + 1)) / live.length }]} />)}
          </View>
        </View>
      ) : null}
      {result ? <JamResults stats={result.stats} keyId={`jam:${result.at}`} summary={jamSummary(song, grid, rate, steps, result.stats)} /> : null}
    </Card>
  );
}

function JamResults({ stats: s, keyId, summary }: { stats: JamStats; keyId: string; summary: Record<string, unknown> }) {
  const e = useSyncExternalStore(onCoachEntries, () => coachEntry<Feedback>(keyId));
  const tiles = jamResultTiles(s);
  return (
    <View style={styles.results} testID="song-jam-results">
      <View style={styles.tiles}>{tiles.map(t => <StatTile key={t.small} value={t.big} label={t.small} />)}</View>
      <Panel style={styles.table}>
        <View style={styles.tr}>{['Drum', 'Hits', 'Timing', 'Consistency', 'Avg velocity', 'Velocity variation'].map(h => <Body key={h} weight="800" size={type.small} style={styles.td}>{h}</Body>)}</View>
        {Object.entries(s.perDrum).map(([pad, d]) => (
          <View key={pad} style={styles.tr}>
            {[PAD_INFO[pad as PadId].name, String(d.hits), timing(d.meanOffset), `±${d.spread} ms`, String(d.velMean), `${d.velCv}%`].map((c, i) => <Body key={i} size={type.small} style={styles.td}>{c}</Body>)}
          </View>
        ))}
      </Panel>
      {!e ? <BigMove testID="song-jam-coach" label="Ask the coach about this jam" emoji="💬" onPress={() => void askFeedback(getHomeServer(), keyId, summary, async () => (await getStorage().coachContext('feedback')).context)} /> : null}
      {e?.status === 'thinking' ? <Small>🤔 The coach is thinking…</Small> : null}
      {e?.status === 'error' ? <Warn>{e.error}</Warn> : null}
      {e?.status === 'done' ? (
        <Panel tone="cream" style={styles.coach}>
          <Body>{e.data.feedback}</Body>
          <Body weight="800">Drill: {e.data.drill.title}</Body>
          <Body>{e.data.drill.instructions}</Body>
        </Panel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 10 },
  go: { marginTop: 14 },
  meter: { height: 36, marginTop: 8, borderWidth: 3, borderColor: color.ink, backgroundColor: color.panel, overflow: 'hidden' },
  zone: { position: 'absolute', left: '37.5%', width: '25%', top: 0, bottom: 0, backgroundColor: color.goodSoft },
  center: { position: 'absolute', left: '50%', width: 2, top: 0, bottom: 0, backgroundColor: color.ink },
  tick: { position: 'absolute', width: 4, top: 4, bottom: 4, marginLeft: -2, backgroundColor: color.blue },
  results: { gap: 12, marginTop: 14 },
  tiles: { flexDirection: 'row', gap: 10 },
  table: { padding: 8 },
  tr: { flexDirection: 'row', paddingVertical: 4 },
  td: { flex: 1 },
  coach: { padding: 12, gap: 6 },
});
