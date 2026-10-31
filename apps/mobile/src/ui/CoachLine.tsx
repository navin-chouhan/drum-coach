// The coach: the round teal drum mascot 🥁 and a comic speech bubble (ipad.css .avatar, .bubble).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { openCoachChat } from './coachChat';
import { MAX_FONT_SCALE } from './Text';
import { color, hardShadow, shadow, stroke } from './tokens';

const MASCOT = { sm: { d: 36, emoji: 18, border: 2.5, shadow: 2 }, md: { d: 50, emoji: 25, border: 3, shadow: 3 }, lg: { d: 66, emoji: 33, border: 3, shadow: 4 } } as const;

export function Mascot({ size = 'md' }: { size?: keyof typeof MASCOT }) {
  const m = MASCOT[size];
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants"
      style={[styles.mascot, { width: m.d, height: m.d, borderRadius: m.d / 2, borderWidth: m.border, boxShadow: hardShadow(m.shadow) }]}>
      <Text style={{ fontSize: m.emoji, lineHeight: m.emoji * 1.15 }}>🥁</Text>
    </View>
  );
}

export type CoachLineProps = {
  /** The line; use <Strong> inside for the bold part. */
  children: ReactNode;
  /** Text size: 18 in a title bar, 20–23 on the player. */
  size?: number;
  mascot?: keyof typeof MASCOT;
  /** One line that shrinks to fit (title bar) or wraps (panels). */
  singleLine?: boolean;
  /** Up to this many lines, shrinking to fit (Journey's notices: the Monday recap is three sentences). */
  lines?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The coach says one thing: the mascot and its bubble. VoiceOver reads it as "Coach: …" and announces changes. A tap
 * opens the chat with the coach (D10: the chat lives behind the bubble on every screen); `chat={false}` turns that off
 * (inside the chat itself).
 */
export function CoachLine({ children, size = 20, mascot = 'md', singleLine = false, lines, style, testID, chat = true }: CoachLineProps & { chat?: boolean }) {
  const body = <>
    <Mascot size={mascot} />
    <View style={styles.bubble}>
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLiveRegion="polite" accessibilityLabel={undefined}
        numberOfLines={lines ?? (singleLine ? 1 : undefined)} adjustsFontSizeToFit={singleLine || !!lines} minimumFontScale={0.8}
        style={[styles.text, { fontSize: size, lineHeight: Math.round(size * 1.3) }]}
      >
        {children}
      </Text>
    </View>
  </>;
  if (!chat) return <View testID={testID} style={[styles.row, style]}>{body}</View>;
  return (
    <Pressable testID={testID} onPress={openCoachChat} accessibilityHint="Opens the chat with your coach"
      style={({ pressed }) => [styles.row, style, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mascot: { backgroundColor: color.teal, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bubble: {
    flexShrink: 1, backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, borderRadius: 18,
    paddingVertical: 8, paddingHorizontal: 16, boxShadow: hardShadow(shadow.card),
  },
  text: { fontWeight: '700', color: color.ink },
  pressed: { opacity: 0.85 },
});
