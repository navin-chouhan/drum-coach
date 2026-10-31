// 2 · Learn by ear: the web's LearnMode. Loop a few bars with a bar of pre-roll, play what you hear; each pass is a
// take (rings), "Use take" copies it into your part, tap cells to fix it, hear it back over the song, save the bars.
// The coach can suggest the groove (it knows songs; it can't hear this recording). Suggested notes from the song's
// audio need tab capture: off on the iPad (B13), with the reason.
import { beatsPerBar, DRUM_PAD, type ChartNote } from '@drum-coach/core/engine/chart';
import type { PadId } from '@drum-coach/core/engine/kit';
import { beatAt } from '@drum-coach/core/engine/tempo';
import { quantizeTake, replaceRange, toggleNote } from '@drum-coach/core/engine/transcribe';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { Body, Button, Card, CardTitle, CheckRow, Choice, Panel, Small, Stepper, Warn, color, type, useAppKey, useKitMoves } from '../../ui';
import { getHomeServer } from '../../platform/api';
import { Row } from './bits';
import { askGroove, coachEntry, COACH_CANT_HEAR, onCoachEntries, type Groove } from './coachAsk';
import { GridEditor } from './GridEditor';
import {
  LEARN_HELP, LEARN_STEPS, VERIFY, clampRange, grooveKey, grooveRequest, hearVelocity, keepTake, learnSaved, loopFrame, loopSpan, notesIn,
  rangeBeats, tileGroove,
} from './modes';
import type { ModeProps } from './modeProps';
import { SheetPart } from './SheetPart';
import { TAB_CAPTURE } from './songsModel';
import { useInterruptions } from './useInterruptions';
import { songsWrite } from './useSongs';

export function LearnPanel({ song, videoId, yt, rate, bus, latencyMs, sound }: ModeProps) {
  const grid = song.grids[videoId];
  const bpb = beatsPerBar(song);
  const [range, setRange] = useState({ from: 1, to: 2 });
  const [steps, setSteps] = useState<number>(4);
  const { fromBeat, toBeat } = rangeBeats(range, bpb);
  const [draft, setDraft] = useState<ChartNote[]>(() => notesIn(song.notes, fromBeat, toBeat));
  const [take, setTake] = useState<ChartNote[]>([]);
  const [looping, setLooping] = useState(false);
  const [hear, setHear] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [msg, setMsg] = useState('');
  const pass = useRef<{ beat: number; pad: PadId; velocity: number }[]>([]);
  const live = useRef({ draft, hear });
  useEffect(() => { live.current = { draft, hear }; });

  const setBars = (from: number, to: number) => {
    const r = clampRange(from, to);
    setRange(r);
    const b = rangeBeats(r, bpb);
    setDraft(notesIn(song.notes, b.fromBeat, b.toBeat));
    setTake([]);
  };

  // Record hits during the loop.
  useEffect(() => {
    if (!looping) return;
    return bus.onHit(h => {
      if (h.pad && yt.playing) pass.current.push({ beat: beatAt(yt.songTime(h.time - latencyMs), grid), pad: h.pad, velocity: h.velocity });
    });
  }, [looping, yt, grid, bus, latencyMs]);

  // Loop A–B with a one-bar pre-roll; each pass becomes a take. Optionally play your part with the drum sounds.
  useEffect(() => {
    if (!looping) return;
    const { preroll, end } = loopSpan(grid, fromBeat, toBeat, bpb);
    yt.seek(preroll); yt.play();
    let raf = 0, prev = yt.songTime();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = yt.songTime();
      const f = loopFrame({ prev, t, end, draft: live.current.draft, hear: live.current.hear, playing: yt.playing, grid });
      for (const n of f.sound) sound(`drum.${DRUM_PAD[n.drum][0]}`, hearVelocity(n) / 127);
      prev = t;
      if (f.passEnded) {
        const q = quantizeTake(pass.current, fromBeat, toBeat, steps);
        setTake(p => keepTake(p, q));
        pass.current = [];
        yt.seek(preroll); prev = preroll;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); yt.pause(); };
  }, [looping, yt, grid, fromBeat, toBeat, bpb, steps, sound]);

  useKitMoves({ yes: () => setLooping(l => !l), stop: () => setLooping(false) }, { playing: looping });
  useAppKey('enter', () => (looping ? false : setLooping(true)));
  useAppKey('escape', () => (looping ? setLooping(false) : false));
  // a call or the app leaving the foreground stops the loop; the unfinished pass is dropped (nothing is saved per pass)
  useInterruptions(looping, () => setLooping(false));

  function save() {
    const r = songsWrite(s => s.songs.patch(song.id, { notes: replaceRange(song.notes, draft, fromBeat, toBeat) }));
    setMsg(r.ok ? learnSaved(range) : r.error);
  }

  // The coach's guess of the groove (from knowledge, not from hearing), tiled over the bars.
  const key = grooveKey(song, grid);
  const groove = useSyncExternalStore(onCoachEntries, () => coachEntry<Groove>(key));
  const ask = (again = false) => void askGroove(getHomeServer(), key, grooveRequest(song, grid, again), again);
  const tiled = tileGroove(groove?.status === 'done' ? groove.data.chart : undefined, fromBeat, toBeat);

  return (
    <Card testID="song-learn">
      <CardTitle>Learn by ear</CardTitle>
      <Small style={styles.gap}>{LEARN_HELP}</Small>
      <Row style={styles.gap}>
        <Stepper label="Bars from" showLabel value={range.from} min={1} max={9999} onChange={v => setBars(v, Math.max(range.to, v))} testID="song-learn-from" />
        <Stepper label="to" showLabel value={range.to} min={range.from} max={9999} onChange={v => setBars(range.from, v)} testID="song-learn-to" />
        <Choice label="Grid" value={steps} options={LEARN_STEPS} onChange={v => setSteps(v)} testID="song-learn-grid" />
      </Row>
      <Row style={styles.gap}>
        <Button testID="song-learn-loop" tone="blue" label={looping ? 'Stop loop' : `Loop bars ${range.from}–${range.to}`} onPress={() => setLooping(l => !l)} />
        <Body size={type.small} color={color.muted}>{Math.round(grid.bpm * rate)} BPM</Body>
      </Row>
      <Row style={styles.gap}>
        <View style={styles.half}><CheckRow label="Hear my part" value={hear} onChange={setHear} testID="song-learn-hear" /></View>
        <View style={styles.half}><CheckRow label="Show as sheet music" value={sheet} onChange={setSheet} testID="song-learn-sheet" /></View>
      </Row>
      <CheckRow label="Suggest notes from the song" value={false} onChange={() => {}} disabled hint={TAB_CAPTURE.suggestHint} testID="song-learn-suggest" />
      <View style={styles.gap}>
        <GridEditor notes={draft} take={take} fromBeat={fromBeat} toBeat={toBeat} stepsPerBeat={steps} beatsPerBar={bpb} yt={yt} grid={grid}
          onToggle={(t, d) => setDraft(n => toggleNote(n, t, d))} />
      </View>
      {sheet ? <View style={styles.gap}><SheetPart notes={draft} timeSignature={song.timeSignature} fromBar={range.from} toBar={range.to} height={220} /></View> : null}
      <Row style={styles.gap}>
        <Button testID="song-learn-use-take" label={`Use take (${take.length} notes)`} disabled={!take.length} onPress={() => setDraft(take)} />
        <Button label="Clear" onPress={() => setDraft([])} />
        <Button testID="song-learn-save" tone="pop" label={`Save bars ${range.from}–${range.to}`} onPress={save} />
        <Button testID="song-learn-groove" label="Ask coach for the groove" disabled={groove?.status === 'thinking'} onPress={() => ask()} />
      </Row>
      {msg ? <Small style={styles.gap}>{msg}</Small> : null}

      <Panel tone={song.verifiedAt ? 'white' : 'cream'} style={styles.verify}>
        <Body>{song.verifiedAt ? VERIFY.done(song.verifiedAt) : VERIFY.todo}</Body>
        <Button testID="song-learn-verify" tone={song.verifiedAt ? 'white' : 'blue'} label={song.verifiedAt ? VERIFY.unmark : VERIFY.mark} disabled={!song.notes.length}
          onPress={() => songsWrite(s => s.songs.patch(song.id, { verified: !song.verifiedAt }))} />
      </Panel>

      {groove?.status === 'thinking' ? <Small style={styles.gap}>🤔 The coach is thinking…</Small> : null}
      {groove?.status === 'error' ? <View style={styles.gap}><Warn>{groove.error}</Warn></View> : null}
      {groove?.status === 'done' ? (
        <Panel style={styles.verify} testID="song-learn-coach">
          <Body weight="800">{groove.data.confidence === 'know' ? '✓ I know this one.' : '🤔 A style guess: check it by ear.'}</Body>
          <Body>{groove.data.reply}</Body>
          <Row>
            {groove.data.chart ? <Button label={`Load the coach's guess into bars ${range.from}–${range.to}`} onPress={() => { if (tiled.length) setDraft(tiled); }} /> : null}
            <Button label="Ask again" onPress={() => ask(true)} />
          </Row>
          <Small>{COACH_CANT_HEAR}</Small>
        </Panel>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 10 },
  half: { flex: 1, minWidth: 220 },
  verify: { marginTop: 14, padding: 12, gap: 10 },
});
