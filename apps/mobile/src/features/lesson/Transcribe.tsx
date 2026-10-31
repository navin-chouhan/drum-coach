// Transcription (web src/lesson/Transcribe.tsx, N7): hear a groove, tap the boxes where each drum plays, check it.
// 80% passes; after two checks "Show me" fills in the answer. The model is ./transcribe.ts.
import type { Chart, ChartDrum } from '@drum-coach/core/engine/chart';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BigMove, Body, Card, Display, MAX_FONT_SCALE, color, drumColor, font, stroke } from '../../ui';
import { cellKey, cellState, checkGrid, checkLine, gridOf, LANE_NAME } from './transcribe';

const LANE_W = 92, CELL_MIN = 36;
const swatch = (d: ChartDrum) => drumColor[d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d];

export function Transcribe({ chart, play, onDone }: { chart: Chart; play: (c: Chart) => void; onDone: () => void }) {
  const g = useMemo(() => gridOf(chart), [chart]);
  const [cells, setCells] = useState<Set<string>>(new Set()), [checked, setChecked] = useState<ReturnType<typeof checkGrid>>(), [tries, setTries] = useState(0);
  const toggle = (k: string) => { setChecked(undefined); setCells(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }); };
  const check = () => { setChecked(checkGrid(cells, chart, g.spb)); setTries(t => t + 1); };
  const ok = !!checked?.ok;

  return (
    <Card tone="cream" style={styles.card} testID="lesson-transcribe">
      <Display size={26}>Listen, then write it: tap the boxes where each drum plays.</Display>
      <ScrollView horizontal contentContainerStyle={styles.gridWrap} accessibilityRole="none">
        <View style={{ minWidth: LANE_W + g.cols * CELL_MIN }}>
          <View style={styles.row}>
            <View style={{ width: LANE_W }} />
            {g.heads.map((h, c) => <Text key={c} maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.head}>{h}</Text>)}
          </View>
          {g.lanes.map(d => (
            <View key={d} style={styles.row}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.lane}>{LANE_NAME[d]}</Text>
              {Array.from({ length: g.cols }, (_, c) => {
                const k = cellKey(d, c), on = cells.has(k), st = cellState(!!checked, on, g.answer.has(k));
                return (
                  <Pressable key={k} onPress={() => toggle(k)} testID={`lesson-transcribe-${d}-${c}`}
                    accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${LANE_NAME[d]}, step ${c + 1}${st ? `, ${st}` : ''}`}
                    style={[styles.cell, c % g.spb === 0 && styles.beat, on && { backgroundColor: swatch(d) },
                      st === 'right' && styles.right, st === 'wrong' && styles.wrong, st === 'missed' && styles.missed]}>
                    <Text style={styles.mark}>{st === 'wrong' ? '✕' : st === 'missed' ? '?' : ''}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      {checked ? <Body size={18} weight="800" color={ok ? color.good : color.bad} testID="lesson-transcribe-said">{checkLine(checked)}</Body> : null}
      <View style={styles.moves}>
        {ok ? <BigMove tone="go" label="✓ Done, next step" onPress={onDone} testID="lesson-transcribe-done" style={styles.move} />
          : <BigMove tone="go" label="Check it" onPress={check} disabled={!cells.size} testID="lesson-transcribe-check" style={styles.move} />}
        <BigMove label="🔁 Hear it again" onPress={() => play(chart)} testID="lesson-transcribe-again" style={styles.move} />
        {!ok && tries >= 2 ? <BigMove tone="alt" label="Show me" onPress={() => { setCells(new Set(g.answer)); setChecked(undefined); }} testID="lesson-transcribe-show" style={styles.move} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, alignSelf: 'stretch' },
  gridWrap: { paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 },
  head: { flex: 1, minWidth: CELL_MIN, textAlign: 'center', fontSize: 14, color: color.muted, ...font.bold },
  lane: { width: LANE_W, fontSize: 16, ...font.semibold, color: color.ink },
  cell: { flex: 1, minWidth: CELL_MIN, height: 44, borderWidth: 1, borderColor: color.ink, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: color.panel },
  beat: { borderLeftWidth: stroke.card },
  right: { borderWidth: 3, borderColor: '#3BB273' },
  wrong: { borderWidth: 3, borderColor: '#E5484D' },
  missed: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#F5A524' },
  mark: { fontSize: 18, ...font.bold, color: '#111' },
  moves: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  move: { minWidth: 220 },
});
