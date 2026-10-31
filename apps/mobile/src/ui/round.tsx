// Promoted from the screens' local pieces (W3): the round glyph button (the lesson's ‹ / ⋯, Practice's − / +, the
// metronome's big − / +), the page turner under a paged sheet, and the label sticker (the intro slides, the pad
// wizard). Same look as each had; one API each.
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button, slopFor } from './controls';
import { MAX_FONT_SCALE } from './Text';
import { color, font, stroke } from './tokens';
import type { PagerView } from './sheetPages';

/**
 * A round button with one glyph. `small` (40 pt, white: the lesson's back / More), `medium` (52 pt, yellow: Practice's
 * tempo − / +, 44 pt target) and `large` (96 pt, yellow: the metronome's − / +, with a long press for fine steps).
 */
export function RoundButton({ glyph, label, onPress, onLongPress, size = 'small', testID }: {
  glyph: string; label: string; onPress: () => void; onLongPress?: () => void; size?: 'small' | 'medium' | 'large'; testID?: string;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={label}
      hitSlop={size === 'small' ? slopFor(40) : size === 'medium' ? slopFor(44) : undefined}
      style={({ pressed }) => [styles[size], pressed && styles.pressed]}>
      <Text style={styles[`${size}Glyph`]}>{glyph}</Text>
    </Pressable>
  );
}

/** ‹ Earlier · Page 2 of 5 · Later › under a sheet shown a page at a time (nothing when it has one page). */
export function SheetPager({ v, onPrev, onNext, tone = 'dark', testID }: {
  v: Pick<PagerView, 'show' | 'canPrev' | 'canNext' | 'label'>; onPrev: () => void; onNext: () => void; tone?: 'dark' | 'light'; testID: string;
}) {
  if (!v.show) return null;
  return (
    <View style={styles.pager} testID={testID}>
      <Button size="small" label="‹ Earlier" accessibilityLabel="Earlier page of your take" disabled={!v.canPrev} onPress={onPrev} testID={`${testID}-prev`} />
      <Text accessibilityLiveRegion="polite" style={[styles.pagerLabel, tone === 'light' && { color: color.ink }]}>{v.label}</Text>
      <Button size="small" label="Later ›" accessibilityLabel="Later page of your take" disabled={!v.canNext} onPress={onNext} testID={`${testID}-next`} />
    </View>
  );
}

/** A label on a coloured strip in the display face: yellow with ink (the pad wizard's step), night with yellow (the intro slides). */
export function Sticker({ text, tone = 'pop', size = 14, letterSpacing, style }: {
  text: string; tone?: 'pop' | 'night'; size?: number; letterSpacing?: number; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[tone === 'night' ? styles.stickerNight : styles.stickerPop, style]}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.stickerText, { fontSize: size, color: tone === 'night' ? color.pop : color.ink }, letterSpacing !== undefined && { letterSpacing }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  small: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.white, borderWidth: 2.5, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  smallGlyph: { ...font.display, fontSize: 20, color: color.ink, lineHeight: 24 },
  medium: { width: 52, height: 52, borderRadius: 26, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.pop, alignItems: 'center', justifyContent: 'center' },
  mediumGlyph: { fontSize: 30, fontWeight: '900', color: color.ink, lineHeight: 34 },
  large: { width: 96, height: 96, borderRadius: 48, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.pop, alignItems: 'center', justifyContent: 'center' },
  largeGlyph: { fontSize: 52, fontWeight: '900', color: color.ink, lineHeight: 58 },
  pressed: { opacity: 0.7 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  pagerLabel: { fontSize: 15, fontWeight: '800', color: color.white, minWidth: 110, textAlign: 'center' },
  stickerPop: { backgroundColor: color.pop, paddingHorizontal: 10, paddingVertical: 2 },
  stickerNight: { backgroundColor: color.night, paddingHorizontal: 14, paddingVertical: 4 },
  stickerText: { ...font.display },
});
