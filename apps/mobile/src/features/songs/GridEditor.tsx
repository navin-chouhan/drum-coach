// The web's GridEditor (src/youtube/GridEditor.tsx) in native views: lanes × steps for bars A–B. Filled = your part,
// rings = the last take, a yellow line = where the song is. Tap a cell to add or remove a note. (Suggested notes
// from the song audio, the dashed squares on the web, need tab capture: off on the iPad, B13.)
import type { ChartDrum, ChartNote } from '@drum-coach/core/engine/chart';
import { beatAt, type BeatGrid } from '@drum-coach/core/engine/tempo';
import { GRID_ROWS as ROWS, GRID_ROW_NAME as NAMES } from '@drum-coach/core/engine/transcribe';
import { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { MAX_FONT_SCALE, color, drumColor } from '../../ui';
import type { YtController } from '../../youtube';

const colorOf = (d: ChartDrum) => drumColor[d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d];
const LABEL = 70, ROW_H = 30;

type Props = {
  notes: ChartNote[]; take: ChartNote[]; fromBeat: number; toBeat: number; stepsPerBeat: number; beatsPerBar: number;
  yt: YtController; grid: BeatGrid; onToggle: (t: number, drum: ChartDrum) => void;
};

export const GridEditor = memo(function GridEditor({ notes, take, fromBeat, toBeat, stepsPerBeat, beatsPerBar, yt, grid, onToggle }: Props) {
  const cols = Math.max(1, Math.round((toBeat - fromBeat) * stepsPerBeat));
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const cw = w > LABEL ? (w - LABEL) / cols : 0;
  const key = (t: number, d: ChartDrum) => `${Math.round(t * 1000)}:${d}`;
  const have = new Map(notes.map(n => [key(n.t, n.drum), n]));
  const ring = new Set(take.map(n => key(n.t, n.drum)));

  return (
    <View style={styles.box} onLayout={onLayout} accessibilityLabel="Drum part editor: tap a cell to add or remove a note">
      {cw > 0 && ROWS.map((d, r) => (
        <View key={d} style={[styles.row, r % 2 === 0 && styles.stripe]}>
          <Text style={styles.name} maxFontSizeMultiplier={MAX_FONT_SCALE}>{NAMES[d]}</Text>
          {Array.from({ length: cols }, (_, i) => {
            const t = fromBeat + i / stepsPerBeat, n = have.get(key(t, d)), onBar = Math.abs(((t / beatsPerBar) % 1)) < 1e-6, onBeat = i % stepsPerBeat === 0;
            return (
              <Pressable key={i} onPress={() => onToggle(t, d)} testID={r === 9 && i === 0 ? 'song-learn-cell-first' : undefined}
                accessibilityRole="button" accessibilityLabel={`${NAMES[d]}, bar ${Math.floor(t / beatsPerBar) + 1}, step ${(i % (stepsPerBeat * beatsPerBar)) + 1}${n ? ', on' : ''}`}
                style={[styles.cell, { width: cw }, onBar ? styles.barLine : onBeat ? styles.beatLine : styles.stepLine]}>
                {ring.has(key(t, d)) ? <View style={[styles.ring, { borderColor: colorOf(d) === '#FFFFFF' ? color.ink : colorOf(d) }]} /> : null}
                {n ? <View style={[styles.dot, { backgroundColor: colorOf(d), opacity: n.ghost ? 0.5 : 1, transform: [{ scale: n.accent ? 1.3 : 1 }] }]} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}
      {cw > 0 ? <Playhead yt={yt} grid={grid} fromBeat={fromBeat} toBeat={toBeat} x0={LABEL} beatW={cw * stepsPerBeat} /> : null}
    </View>
  );
});

/** The song's position, redrawn on each frame (only this line re-renders). */
function Playhead({ yt, grid, fromBeat, toBeat, x0, beatW }: { yt: YtController; grid: BeatGrid; fromBeat: number; toBeat: number; x0: number; beatW: number }) {
  const [b, setB] = useState(() => beatAt(yt.songTime(), grid));
  useEffect(() => {
    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); const v = beatAt(yt.songTime(), grid); setB(p => (Math.abs(p - v) < 0.01 ? p : v)); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [yt, grid]);
  if (!(b >= fromBeat && b < toBeat)) return null;
  return <View pointerEvents="none" style={[styles.head, { left: x0 + (b - fromBeat) * beatW }]} />;
}

const styles = StyleSheet.create({
  box: { backgroundColor: color.night, borderWidth: 3, borderColor: color.ink, overflow: 'hidden' },
  row: { flexDirection: 'row', height: ROW_H, alignItems: 'stretch' },
  stripe: { backgroundColor: 'rgba(255,255,255,0.05)' },
  name: { width: LABEL, color: '#E6E6E6', fontSize: 12, fontWeight: '700', paddingLeft: 6, alignSelf: 'center' },
  cell: { alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1 },
  barLine: { borderLeftColor: 'rgba(255,225,77,0.5)' },
  beatLine: { borderLeftColor: 'rgba(255,255,255,0.18)' },
  stepLine: { borderLeftColor: 'rgba(255,255,255,0.06)' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  ring: { position: 'absolute', width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  head: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: color.pop },
});
