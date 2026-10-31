// The hot-pink dotted ground every sidebar screen sits on, with the content area's padding and safe areas
// (ipad.css .ipad/.main: 26 pt from the sidebar's yellow edge, 24 pt on the right, 8 pt under the status bar).
import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color } from './tokens';
import DOTS from './assets/dots.png';


/** Just the ground: pink with white dots (12 pt grid). Fills its parent. */
export function DottedGround({ style, children, tone = color.ground }: { style?: StyleProp<ViewStyle>; children?: ReactNode; tone?: string }) {
  return (
    <View style={[styles.fill, { backgroundColor: tone }, style]}>
      {/* the dots as a repeated image behind the content (ImageBackground is deprecated) */}
      <Image source={DOTS} resizeMode="repeat" style={StyleSheet.absoluteFill} accessible={false} accessibilityIgnoresInvertColors />
      {children}
    </View>
  );
}

export type ScreenProps = {
  children: ReactNode;
  testID?: string;
  /** The sidebar is to the left (no left safe area to keep); full-screen frames (player, first run) pass false. */
  withSidebar?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A screen's frame: the ground, then the content laid out inside the safe area with the mockups' margins. */
export function Screen({ children, testID, withSidebar = true, style }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <DottedGround>
      <View
        testID={testID}
        style={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 20) + 8,
            paddingBottom: Math.max(insets.bottom, 12) + 8,
            paddingLeft: (withSidebar ? 0 : insets.left) + 26,
            paddingRight: insets.right + 24,
          },
          style,
        ]}
      >
        {children}
      </View>
    </DottedGround>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  content: { flex: 1 },
});
