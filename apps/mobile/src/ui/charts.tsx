// Small charts drawn with Views, and a notice: a dismissible Notice, Bars on a baseline (with a dashed goal line),
// a progress Track and a sparkline of Dots. Promoted from features/practice/parts.tsx (A7d) by I2.
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { slopFor } from './controls';
import { barHeight, dotPositions, percent } from './kitMath';
import { Body, tabular } from './Text';
import { color, stroke } from './tokens';

/** A one-line notice in a cream box with a ✕ (what can't happen yet, or why something failed). */
export function Notice({ text, onClose, testID }: { text: string; onClose?: () => void; testID?: string }) {
  return (
    <View testID={testID} style={styles.notice} accessibilityLiveRegion="polite">
      <Body size={14} weight="700" style={styles.grow}>{text}</Body>
      {onClose ? <Pressable onPress={onClose} hitSlop={slopFor(24)} accessibilityRole="button" accessibilityLabel="Close"><Text style={styles.x}>✕</Text></Pressable> : null}
    </View>
  );
}

export type Bar = { key: string; value: number; label?: string; fill: string; title: string };

/**
 * Bars on a baseline: `max` is the top of the scale; `line` draws a dashed level (the daily goal) with its words; the
 * value over the last bar when `showLast`. Each bar says its title to VoiceOver.
 */
export function Bars({ bars, max, height, line, showLast, barWidth, style, testID, accessibilityLabel }: {
  bars: readonly Bar[]; max: number; height: number; line?: { value: number; words: string }; showLast?: boolean; barWidth?: number;
  style?: StyleProp<ViewStyle>; testID?: string; accessibilityLabel: string;
}) {
  const y = (v: number) => barHeight(v, max, height);
  return (
    <View style={style} testID={testID} accessibilityLabel={accessibilityLabel}>
      <View style={[styles.plot, { height }]}>
        {line ? <View style={[styles.goal, { bottom: y(line.value) }]} accessible={false}>
          {/* drawn dashes: iOS can't draw a dashed border on one side only ("Unsupported dashed / dotted border style") */}
          <View style={styles.dashes}>{DASHES.map(k => <View key={k} style={styles.dash} />)}</View>
          <Text maxFontSizeMultiplier={1} style={styles.goalText}>{line.words}</Text>
        </View> : null}
        {bars.map((b, i) => (
          <View key={b.key} style={styles.slot} accessible accessibilityLabel={b.title}>
            {showLast && i === bars.length - 1 ? <Text maxFontSizeMultiplier={1} style={[styles.val, tabular]}>{`${b.value}%`}</Text> : null}
            {b.value > 0
              ? <View style={[styles.bar, { height: Math.max(3, y(b.value)), backgroundColor: b.fill, width: barWidth }]} />
              : <View style={[styles.zero, { width: barWidth }]} />}
          </View>
        ))}
      </View>
      {bars.some(b => b.label) ? <View style={styles.labels}>
        {bars.map(b => <Text key={b.key} maxFontSizeMultiplier={1} numberOfLines={1} style={styles.label}>{b.label ?? ''}</Text>)}
      </View> : null}
    </View>
  );
}

/** A horizontal track: `done` (0–1) in blue, `started` in light blue after it. */
export function Track({ done, started = 0, height = 18, fill = color.blue, style }: { done: number; started?: number; height?: number; fill?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.track, { height }, style]} accessible={false}>
      <View style={{ width: percent(done), backgroundColor: fill }} />
      {started > 0 ? <View style={{ width: percent(Math.max(0.02, started)), backgroundColor: color.blueSoft }} /> : null}
    </View>
  );
}

/** A tiny line of dots (the last 6 months, the last takes): higher is better; the newest is blue. */
export function Dots({ values, max = 100, width = 120, height = 30, label }: { values: readonly number[]; max?: number; width?: number; height?: number; label: string }) {
  const at = dotPositions(values, { max, width, height });
  return (
    <View style={{ width, height }} accessible accessibilityLabel={`${label}: latest ${values.at(-1) ?? 0}`}>
      {at.map((p, i) => (
        <View key={i} style={[styles.dot, p, { backgroundColor: i === at.length - 1 ? color.blue : color.blueSoft }]} />
      ))}
    </View>
  );
}

/** Enough dashes for the widest chart (the row clips the rest). */
const DASHES = Array.from({ length: 140 }, (_, k) => k);

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: color.cream, borderWidth: stroke.thin, borderColor: color.ink, paddingVertical: 6, paddingHorizontal: 12 },
  grow: { flex: 1, minWidth: 0 },
  x: { fontSize: 16, fontWeight: '900', color: color.ink },
  plot: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, borderBottomWidth: stroke.card, borderBottomColor: color.ink },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { alignSelf: 'stretch', borderWidth: 2.5, borderColor: color.ink, borderBottomWidth: 0 },
  zero: { alignSelf: 'stretch', height: 3, backgroundColor: color.separator },
  val: { fontSize: 12, fontWeight: '900', color: color.ink, marginBottom: 2 },
  goal: { position: 'absolute', left: 0, right: 0, height: 2.5, zIndex: 1 },
  dashes: { flexDirection: 'row', height: 2.5, overflow: 'hidden', gap: 4 },
  dash: { width: 7, height: 2.5, backgroundColor: color.ink },
  goalText: { position: 'absolute', right: 0, bottom: 2, fontSize: 11, fontWeight: '800', color: color.ink },
  labels: { flexDirection: 'row', gap: 6, marginTop: 4 },
  label: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: color.muted },
  track: { flexDirection: 'row', borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, overflow: 'hidden' },
  dot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: color.ink },
});
