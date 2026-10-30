// Controls: Button (the web's pill button), Pill, GestureChip, BigMove (a move tile with its kit gestures), Toggle and
// Segmented. Every target is at least 44 pt (smaller drawings get hitSlop) and says what it is to VoiceOver.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type Insets, type StyleProp, type ViewStyle } from 'react-native';
import { pressedBy } from './Card';
import { gestureLabel, gestureSpoken, type Gesture } from './gestures';
import { Display, MAX_FONT_SCALE } from './Text';
import { color, font, hardShadow, padColor, shadow, stroke, TOUCH_MIN, type } from './tokens';

/** Extra touch area so a drawing of `height` pt is still a 44 pt target. */
export const slopFor = (height: number): Insets => {
  const pad = Math.max(0, Math.ceil((TOUCH_MIN - height) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
};

export type ButtonTone = 'white' | 'pop' | 'blue' | 'red' | 'plain';
const BTN_BG: Record<ButtonTone, string> = { white: color.panel, pop: color.pop, blue: color.blue, red: color.bad, plain: 'transparent' };

export type ButtonProps = {
  label: string;
  emoji?: string;
  /** Something drawn after the label (a chevron). */
  trailing?: ReactNode;
  onPress?: () => void;
  tone?: ButtonTone;
  size?: 'regular' | 'small';
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/** The pill button: white (or yellow, blue, red) with an ink outline and a 3 pt shadow; "plain" is a text button. */
export function Button({ label, emoji, trailing, onPress, tone = 'white', size = 'regular', disabled, testID, accessibilityLabel, accessibilityHint, style }: ButtonProps) {
  const h = size === 'small' ? 38 : 44;
  const plain = tone === 'plain';
  const ink = tone === 'blue' || tone === 'red' ? color.white : color.ink;
  return (
    <Pressable
      testID={testID} onPress={onPress} disabled={disabled} hitSlop={slopFor(h)}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.btn, { height: h, paddingHorizontal: size === 'small' ? 13 : 16, backgroundColor: BTN_BG[tone] },
        plain ? styles.plain : { boxShadow: hardShadow(shadow.button) },
        pressed && !plain && pressedBy(shadow.button), pressed && plain && styles.dim, disabled && styles.dim, style,
      ]}
    >
      {emoji ? <Text style={[styles.btnEmoji, { fontSize: size === 'small' ? 16 : 17 }]}>{emoji}</Text> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[styles.btnText, { color: ink, fontSize: size === 'small' ? 14 : 15 }]}>{label}</Text>
      {trailing}
    </Pressable>
  );
}

/** A small rounded tag ("12 min", "Practice"); `tone` tints it. Not a button. */
export function Pill({ children, emoji, tone = 'white', style }: { children: ReactNode; emoji?: string; tone?: 'white' | 'pop' | 'green' | 'orange' | 'red' | 'blue'; style?: StyleProp<ViewStyle> }) {
  const bg = { white: color.panel, pop: color.pop, green: color.goodSoft, orange: color.orangeSoft, red: color.badSoft, blue: color.blueSoft }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      {emoji ? <Text style={styles.pillEmoji}>{emoji}</Text> : null}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.pillText}>{children}</Text>
    </View>
  );
}

/**
 * A kit gesture: the web's black pill with yellow text and the pad's colour dot ("● hi-hat pedal × 3"). On the blue
 * main move it turns yellow with black text (`onTint`).
 */
export function GestureChip({ gesture, onTint = false, size = 'regular' }: { gesture: Gesture; onTint?: boolean; size?: 'regular' | 'large' }) {
  const lg = size === 'large';
  return (
    <View accessible accessibilityLabel={`From the kit: ${gestureSpoken(gesture)}`}
      style={[styles.chip, lg && styles.chipLg, { backgroundColor: onTint ? color.pop : color.night }]}>
      <View style={[styles.chipDot, { backgroundColor: padColor(gesture.pad), borderColor: onTint ? color.ink : color.pop }]} />
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.chipText, lg && styles.chipTextLg, { color: onTint ? color.ink : color.pop }]}>{gestureLabel(gesture)}</Text>
    </View>
  );
}

export type BigMoveProps = {
  label: string;
  emoji?: string;
  /** go = the blue main move (bigger label, yellow chips); alt = cream; night = black. */
  tone?: 'go' | 'white' | 'alt' | 'night';
  /** The kit gestures that do this move, joined by "or". */
  gestures?: Gesture[];
  /** A short line under the label instead of (or after) the gestures: "no score, with the band". */
  note?: string;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

const MOVE_BG = { go: color.blue, white: color.panel, alt: color.cream, night: color.night } as const;

/** A move: a big outlined tile you can tap from the throne, with the gestures that do it from the kit. */
export function BigMove({ label, emoji, tone = 'white', gestures = [], note, onPress, disabled, testID, style }: BigMoveProps) {
  const go = tone === 'go';
  const ink = go || tone === 'night' ? color.white : color.ink;
  const spoken = [label, ...gestures.map(g => gestureSpoken(g)), note].filter(Boolean).join('. ');
  return (
    <Pressable
      testID={testID} onPress={onPress} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={spoken} accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.move, { backgroundColor: MOVE_BG[tone], boxShadow: hardShadow(shadow.card) }, pressed && pressedBy(shadow.card), disabled && styles.dim, style]}
    >
      <View style={styles.moveHead}>
        {emoji ? <Text style={[styles.moveEmoji, go && styles.moveEmojiGo, { color: ink }]}>{emoji}</Text> : null}
        <Display size={go ? type.bigMove : type.move} color={ink} style={styles.moveLabel}>{label}</Display>
      </View>
      {gestures.length || note ? (
        <View style={styles.moveFoot}>
          {gestures.map((g, i) => (
            <View key={`${g.pad}${g.times}`} style={styles.moveFootItem}>
              {i > 0 ? <Text style={[styles.or, { color: go ? color.white : color.muted }]}>or</Text> : null}
              <GestureChip gesture={g} onTint={go} />
            </View>
          ))}
          {note ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.moveNote, { color: go ? color.white : color.muted }]}>{note}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/** An on/off switch drawn in the kit's style (green when on). */
export function Toggle({ value, onChange, label, testID, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; testID?: string; disabled?: boolean }) {
  return (
    <Pressable testID={testID} onPress={() => onChange(!value)} disabled={disabled} hitSlop={slopFor(32)}
      accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled: !!disabled }}
      style={[styles.toggle, { backgroundColor: value ? color.good : color.toggleOff }, disabled && styles.dim]}>
      <View style={[styles.knob, { left: value ? 26 : 2 }]} />
    </Pressable>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string; count?: number };

/** A pill segmented control: the chosen segment is yellow with an inset outline. */
export function Segmented<T extends string>({ options, value, onChange, testID, accessibilityLabel }: { options: SegmentOption<T>[]; value: T; onChange: (v: T) => void; testID?: string; accessibilityLabel?: string }) {
  return (
    <View testID={testID} style={styles.seg} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} hitSlop={slopFor(32)}
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.count !== undefined ? `${o.label}, ${o.count}` : o.label}
            style={[styles.segItem, on && styles.segOn]}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.segText, on && styles.segTextOn]}>
              {o.label}{o.count !== undefined ? <Text style={styles.segCount}>  {o.count}</Text> : null}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 999, borderWidth: stroke.card, borderColor: color.ink, alignSelf: 'flex-start' },
  plain: { borderWidth: 0, paddingHorizontal: 6 },
  btnEmoji: { lineHeight: 20 },
  btnText: { ...font.heavy },
  dim: { opacity: 0.55 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, borderWidth: stroke.thin, borderColor: color.ink, alignSelf: 'flex-start' },
  pillEmoji: { fontSize: 14 },
  pillText: { ...font.heavy, fontSize: type.chip, color: color.ink },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingLeft: 5, paddingRight: 11, borderRadius: 999, alignSelf: 'flex-start' },
  chipLg: { height: 32, paddingLeft: 6, paddingRight: 13 },
  chipDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  chipText: { ...font.heavy, fontSize: type.chip },
  chipTextLg: { fontSize: 15 },
  move: { borderWidth: stroke.card, borderColor: color.ink, paddingVertical: 12, paddingHorizontal: 14, minHeight: 88, justifyContent: 'space-between', gap: 8 },
  moveHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moveEmoji: { fontSize: 23 },
  moveEmojiGo: { fontSize: 28 },
  moveLabel: { flexShrink: 1 },
  moveFoot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 6 },
  moveFootItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  or: { fontSize: 13, fontWeight: '700' },
  moveNote: { fontSize: 14, fontWeight: '600' },
  toggle: { width: 56, height: 32, borderRadius: 16, borderWidth: stroke.card, borderColor: color.ink, justifyContent: 'center' },
  knob: { position: 'absolute', top: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: color.white, borderWidth: 2.5, borderColor: color.ink },
  seg: { flexDirection: 'row', height: 38, padding: 2, gap: 2, borderRadius: 999, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, boxShadow: hardShadow(shadow.button), alignSelf: 'flex-start' },
  segItem: { justifyContent: 'center', paddingHorizontal: 13, borderRadius: 999 },
  segOn: { backgroundColor: color.pop, borderWidth: 2, borderColor: color.ink },
  segText: { fontSize: 14, fontWeight: '700', color: color.ink },
  segTextOn: { fontWeight: '900' },
  segCount: { fontSize: 12, color: color.muted, fontWeight: '700' },
});
