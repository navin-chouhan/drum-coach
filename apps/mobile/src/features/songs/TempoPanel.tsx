// 1 · Set tempo: the web's TempoMode. Tap the beat (any pad, a key, or the Tap button) while the song plays → this
// video's beat grid; nudge it, click along to check it by ear, save.
import { beatsPerBar } from '@drum-coach/core/engine/chart';
import type { BeatGrid } from '@drum-coach/core/engine/tempo';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigMove, Body, Button, Card, CardTitle, CheckRow, Choice, Display, Small, color, tabular, type } from '../../ui';
import { Row } from './bits';
import { GRID_ADJUST, SIGS, TEMPO_SAVED, addTap, clickDue, gridToSave, knownGrid, residualText, tapFit, tempoHelp } from './modes';
import type { ModeProps } from './modeProps';
import { songsWrite } from './useSongs';

export function TempoPanel({ song, videoId, yt, bus, latencyMs, sound }: ModeProps) {
  const bpb = beatsPerBar(song);
  const saved = song.grids[videoId];
  const known = knownGrid(song);
  const [taps, setTaps] = useState<number[]>([]);
  const [draft, setDraft] = useState<BeatGrid | null>(null);
  const [check, setCheck] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => bus.onHit(h => {
    if (!yt.playing) return;
    const t = yt.songTime(h.time - latencyMs);
    setDraft(null);
    setTaps(prev => addTap(prev, t));
  }), [bus, yt, latencyMs]);

  const fit = tapFit(taps, bpb, known, saved);
  const shown = draft ?? fit ?? saved ?? null;

  // Click on every beat over the song so you can check the grid by ear.
  const lastBeat = useRef(-1);
  useEffect(() => {
    if (!check || !shown) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!yt.playing) return;
      const c = clickDue(lastBeat.current, yt.songTime(), shown, bpb);
      if (c.click) sound(c.click === 'accent' ? 'click.bar' : 'click.beat', 1);
      lastBeat.current = c.beat;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [check, shown, yt, bpb, sound]);

  function save() {
    if (!shown) return;
    const r = songsWrite(s => s.songs.saveGrid(videoId, gridToSave(shown, bpb)));
    if (!r.ok) { setMsg(r.error); return; }
    setDraft(null); setTaps([]); setMsg(TEMPO_SAVED);
  }
  const residual = fit && 'residualMs' in fit && typeof fit.residualMs === 'number' ? fit.residualMs : null;

  return (
    <Card testID="song-tempo">
      <CardTitle>Set tempo</CardTitle>
      <Small style={styles.gap}>{tempoHelp(!!known, !!saved)}</Small>
      <View style={styles.gap}>
        <Choice label="Time signature" testID="song-tempo-sig" value={song.timeSignature.join('/')}
          options={SIGS.map(s => ({ value: s.join('/'), label: s.join('/') }))}
          onChange={v => { const ts = SIGS.find(s => s.join('/') === v); if (ts) songsWrite(s => s.songs.patch(song.id, { timeSignature: ts })); }} />
      </View>
      <Row style={styles.big}>
        <BigMove testID="song-tempo-tap" tone="go" emoji="👆" label="Tap" note="or hit any pad on the beat" onPress={() => bus.emitPad('snare', 90)} style={styles.tap} />
        <View style={styles.grow} accessibilityLiveRegion="polite">
          {shown ? (
            <>
              <Display size={40} style={tabular}>{shown.bpm.toFixed(1)}</Display>
              <Body size={type.small} color={color.muted}>BPM · downbeat at {shown.offsetSec.toFixed(2)} s</Body>
            </>
          ) : <Body weight="700">Taps: {taps.length}</Body>}
          {residual !== null ? <Small>{residualText(taps.length, residual)}</Small> : null}
        </View>
      </Row>
      {shown ? (
        <View style={styles.stack}>
          <Row>
            {GRID_ADJUST.map(a => (
              <Button key={a.label} size="small" label={a.label} accessibilityHint={a.hint} onPress={() => setDraft(a.f(shown))} testID={`song-tempo-adjust-${a.label}`} />
            ))}
          </Row>
          <CheckRow label="Click along so I can check it (accent = bar start)" value={check} onChange={setCheck} testID="song-tempo-check" />
          <Row>
            <Button testID="song-tempo-save" tone="blue" label="Save tempo" onPress={save} />
            <Button label="Clear taps" onPress={() => { setTaps([]); setDraft(null); }} />
          </Row>
        </View>
      ) : null}
      {msg ? <Small style={styles.gap}>{msg}</Small> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { marginTop: 10 },
  big: { marginTop: 14, alignItems: 'center' },
  tap: { width: 220 },
  grow: { flex: 1 },
  stack: { gap: 12, marginTop: 14 },
});
