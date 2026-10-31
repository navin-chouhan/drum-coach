// Journey's text link (the web's `button.link`), used for "why this one?". Local to Journey (the kit has none).
import { Pressable, StyleSheet, Text } from 'react-native';
import { MAX_FONT_SCALE, color, slopFor } from '../../ui';

/** A text link: one line of text, its touch area grown to 44 pt, so it adds no height. */
export function LinkText({ label, onPress, testID, accessibilityLabel, size = 13 }: { label: string; onPress: () => void; testID?: string; accessibilityLabel?: string; size?: number }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} hitSlop={slopFor(size + 4)}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[styles.link, { fontSize: size }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { fontWeight: '800', color: color.ink, textDecorationLine: 'underline' },
});
