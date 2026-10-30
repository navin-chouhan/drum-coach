// Numbers and lists: StatTile ("6 / day streak"), Ring (rank and song progress), Stars, Tick and ListRow.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ringAngles } from './layout';
import { Display, MAX_FONT_SCALE, tabular } from './Text';
import { color, font, hardShadow, shadow, stroke, type } from './tokens';

/** A cream tile with a big number and a small caption under it. `unit` is the small "/25". */
export function StatTile({ value, unit, label, style, testID }: { value: string; unit?: string; label: string; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View testID={testID} accessible accessibilityLabel={`${label}: ${value}${unit ?? ''}`} style={[styles.tile, style]}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.tileValue, tabular]}>
        {value}{unit ? <Text style={styles.tileUnit}>{unit}</Text> : null}
      </Text>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export type RingProps = {
  /** 0–1 filled, clockwise from 12 o'clock. */
  fraction: number;
  size?: number;
  fill?: string;
  /** The ring's width (outer − inner radius). */
  thickness?: number;
  /** What sits in the middle: "3/9" over "stage 3". */
  value?: string;
  caption?: string;
  accessibilityLabel?: string;
  testID?: string;
};

/** A progress ring with an outlined centre (ipad.css .ring): two half-discs turned by ringAngles. */
export function Ring({ fraction, size = 74, fill = color.good, thickness = 11, value, caption, accessibilityLabel, testID }: RingProps) {
  const { right, left } = ringAngles(fraction);
  const half = size / 2;
  const inner = size - 2 * thickness;
  const disc: ViewStyle = { position: 'absolute', top: 0, width: size, height: size };
  return (
    <View testID={testID} accessible={!!accessibilityLabel} accessibilityRole={accessibilityLabel ? 'progressbar' : undefined} accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(1, Math.max(0, fraction)) * 100) }}
      style={[styles.ring, { width: size, height: size, borderRadius: half, boxShadow: hardShadow(shadow.button) }]}>
      <View style={[styles.clip, { left: half, width: half, height: size }]}>
        <View style={[disc, { left: -half, transform: [{ rotate: `${right}deg` }] }]}>
          <View style={{ width: half, height: size, backgroundColor: fill, borderTopLeftRadius: half, borderBottomLeftRadius: half }} />
        </View>
      </View>
      <View style={[styles.clip, { left: 0, width: half, height: size }]}>
        <View style={[disc, { left: 0, transform: [{ rotate: `${left}deg` }] }]}>
          <View style={{ marginLeft: half, width: half, height: size, backgroundColor: fill, borderTopRightRadius: half, borderBottomRightRadius: half }} />
        </View>
      </View>
      <View style={[styles.ringCentre, { width: inner, height: inner, borderRadius: inner / 2 }]}>
        {value ? <Text maxFontSizeMultiplier={1} style={[styles.ringValue, tabular, { fontSize: Math.round(inner * 0.29) }]}>{value}</Text> : null}
        {caption ? <Text maxFontSizeMultiplier={1} style={[styles.ringCaption, { fontSize: Math.max(9, Math.round(inner * 0.19)) }]}>{caption}</Text> : null}
      </View>
    </View>
  );
}

/** ★★☆: earned stars gold, the rest grey. */
export function Stars({ n, of = 3, size = 15 }: { n: number; of?: number; size?: number }) {
  const on = Math.max(0, Math.min(of, Math.round(n)));
  return (
    <Text accessibilityLabel={`${on} of ${of} stars`} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.stars, { fontSize: size }]}>
      {'★'.repeat(on)}<Text style={styles.starOff}>{'★'.repeat(of - on)}</Text>
    </Text>
  );
}

/** A list item's round mark: green ✓ done, yellow current, white to do. */
export function Tick({ state }: { state: 'done' | 'current' | 'todo' }) {
  return (
    <View style={[styles.tick, { backgroundColor: state === 'done' ? color.good : state === 'current' ? color.pop : color.panel }]}>
      {state === 'done' ? <Text style={styles.tickMark}>✓</Text> : null}
    </View>
  );
}

export type ListRowProps = {
  /** Drawn at the start (a Tick, an emoji box). */
  lead?: ReactNode;
  title: string;
  /** Muted words after the title ("· review"). */
  detail?: string;
  /** Right-aligned: "12 min", or stars. */
  value?: ReactNode;
  bold?: boolean;
  /** Rows of a list are separated by a thin line; the first row has none. */
  first?: boolean;
  compact?: boolean;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
};

export function ListRow({ lead, title, detail, value, bold, first, compact, onPress, testID, accessibilityLabel }: ListRowProps) {
  const content = (
    <>
      {lead}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[styles.rowTitle, bold && styles.rowBold, compact && styles.rowCompactText]}>
        {title}{detail ? <Text style={styles.rowDetail}>{` · ${detail}`}</Text> : null}
      </Text>
      {typeof value === 'string' ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.rowValue, tabular]}>{value}</Text> : value}
    </>
  );
  const style = [styles.row, compact && styles.rowCompact, !first && styles.rowSep];
  if (!onPress) return <View testID={testID} style={style} accessible accessibilityLabel={accessibilityLabel}>{content}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [...style, pressed && styles.rowPressed]}>
      {content}
    </Pressable>
  );
}

/** A heading for a card in the display face. */
export function CardTitle({ children, size = type.rank }: { children: ReactNode; size?: number }) {
  return <Display size={size} accessibilityRole="header">{children}</Display>;
}

const styles = StyleSheet.create({
  tile: { flex: 1, minWidth: 0, backgroundColor: color.cream, borderWidth: stroke.card, borderColor: color.ink, paddingVertical: 4, paddingHorizontal: 8 },
  tileValue: { ...font.display, fontSize: type.stat, lineHeight: 26, color: color.ink },
  tileUnit: { fontSize: 13, color: color.muted },
  tileLabel: { fontSize: 12, fontWeight: '800', color: color.muted },
  ring: { borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  ringCentre: { backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  ringValue: { ...font.display, color: color.ink },
  ringCaption: { ...font.display, color: color.ink, marginTop: -1 },
  stars: { color: color.star, letterSpacing: 0, textShadowColor: color.ink, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 1 },
  starOff: { color: color.starOff },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: stroke.thin, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  tickMark: { color: color.white, fontSize: 12, fontWeight: '900', lineHeight: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingVertical: 6, paddingHorizontal: 14 },
  rowCompact: { minHeight: 31, paddingVertical: 2, paddingHorizontal: 0, gap: 10 },
  rowSep: { borderTopWidth: stroke.thin, borderTopColor: color.separator },
  rowPressed: { backgroundColor: 'rgba(20,20,20,0.06)' },
  rowTitle: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '600', color: color.ink },
  rowCompactText: { fontSize: 15 },
  rowBold: { fontWeight: '800' },
  rowDetail: { color: color.muted, fontWeight: '600' },
  rowValue: { marginLeft: 'auto', color: color.muted, fontSize: 13, fontWeight: '600', textAlign: 'right' },
});
