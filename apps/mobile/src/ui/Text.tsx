// Text in the kit's two faces: Display (the chunky headings, moves and numbers) and Body (everything else).
// Each screen is one landscape frame with no scrolling, so larger accessibility text grows a little, not without end.
import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { color, font, type } from './tokens';

/** How far Dynamic Type may grow kit text: enough to help, not enough to push a frame off the screen. */
export const MAX_FONT_SCALE = 1.2;

type Props = Omit<TextProps, 'style'> & { size?: number; color?: string; style?: StyleProp<TextStyle>; children?: ReactNode };

/** The heavy display face (SF Pro Black): titles, move names, big numbers. */
export function Display({ size = type.move, color: c = color.ink, style, ...rest }: Props) {
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} {...rest} style={[styles.display, { fontSize: size, lineHeight: Math.round(size * 1.12), color: c }, style]} />;
}

/** Body text; `weight` follows the mockups (600 body, 700–800 for emphasis). */
export function Body({ size = type.body, color: c = color.ink, weight = '600', style, ...rest }: Props & { weight?: TextStyle['fontWeight'] }) {
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} {...rest} style={[{ fontSize: size, lineHeight: Math.round(size * 1.35), color: c, fontWeight: weight }, style]} />;
}

/** Bold inside Body or a coach line ("<b>Six days in a row.</b>"). */
export function Strong({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.strong, style]}>{children}</Text>;
}

/** Tabular numbers, so counts don't jitter as they change. */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

const styles = StyleSheet.create({
  display: { ...font.display, letterSpacing: 0.1 },
  strong: { fontWeight: '900' },
});
