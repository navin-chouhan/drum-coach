// Boxes: Card (black outline, square corners, hard shadow), Panel (an outlined box inside a card, no shadow) and
// Label (the black tag with yellow capitals that heads a section: "UP NEXT", "TODAY'S SET").
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MAX_FONT_SCALE } from './Text';
import { color, font, hardShadow, shadow, stroke, type } from './tokens';

export type Tone = 'white' | 'cream' | 'pop' | 'night' | 'blue';
export const toneBg: Record<Tone, string> = { white: color.panel, cream: color.cream, pop: color.pop, night: color.night, blue: color.blue };
/** Text on each tone. */
export const toneInk: Record<Tone, string> = { white: color.ink, cream: color.ink, pop: color.ink, night: color.nightText, blue: color.white };

export type CardProps = {
  children?: ReactNode;
  tone?: Tone;
  /** Shadow offset in pt (default 5; the big lesson card uses 6). Night cards cast a yellow shadow, as on the web. */
  elevation?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Makes the whole card one button. */
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function Card({ children, tone = 'white', elevation = shadow.card, style, testID, onPress, accessibilityLabel }: CardProps) {
  const base = [styles.card, { backgroundColor: toneBg[tone], boxShadow: hardShadow(elevation, tone === 'night' ? color.pop : color.ink) }, style];
  if (!onPress) return <View testID={testID} style={base} accessibilityLabel={accessibilityLabel}>{children}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, pressed && pressedBy(elevation)]}>
      {children}
    </Pressable>
  );
}

/** The comic "push in" while pressed: the box moves onto its shadow. */
export const pressedBy = (offset: number): ViewStyle => ({ transform: [{ translateX: offset - 1 }, { translateY: offset - 1 }], boxShadow: hardShadow(1) });

/** An outlined box without a shadow, inside a card (the yellow lesson panel, the groove preview). */
export function Panel({ children, tone = 'white', style, testID }: Omit<CardProps, 'elevation' | 'onPress' | 'accessibilityLabel'>) {
  return <View testID={testID} style={[styles.panel, { backgroundColor: toneBg[tone] }, style]}>{children}</View>;
}

/** The section tag: black with yellow capitals. */
export function Label({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.label, style]}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.labelText} accessibilityRole="header">{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: stroke.card, borderColor: color.ink, borderRadius: 0, paddingVertical: 14, paddingHorizontal: 16 },
  panel: { borderWidth: stroke.card, borderColor: color.ink },
  label: { alignSelf: 'flex-start', backgroundColor: color.ink, paddingHorizontal: 8, paddingTop: 3, paddingBottom: 2 },
  labelText: { ...font.display, fontSize: type.label, letterSpacing: 0.7, textTransform: 'uppercase', color: color.pop },
});
