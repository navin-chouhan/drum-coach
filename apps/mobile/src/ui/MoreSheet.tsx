// The ⋯ pattern (D10 reorganisation: one main job per screen, the rest one tap deeper): a round ⋯ button and the sheet
// it opens on the right, over a dimmed screen. Rows are SheetItem (emoji, label, an optional line under it, an
// optional gesture or key) or anything else. Esc on a hardware keyboard closes it, as a tap outside does.
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { refocusKeyboard } from '../platform/keyboard';
import { Card, Label } from './Card';
import { slopFor } from './controls';
import { useAppKey } from './hooks';
import { Body, Display, MAX_FONT_SCALE } from './Text';
import { color, font, hardShadow, shadow, stroke } from './tokens';

/** The round ⋯ button (title bars, the player's bar). */
export function MoreButton({ onPress, label = 'More', tone = 'white', testID }: { onPress: () => void; label?: string; tone?: 'white' | 'night'; testID?: string }) {
  const night = tone === 'night';
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={slopFor(44)}
      style={({ pressed }) => [styles.more, night && styles.moreNight, { boxShadow: hardShadow(shadow.button, night ? color.pop : color.ink) }, pressed && styles.pressed]}>
      <Text maxFontSizeMultiplier={1} style={[styles.moreText, night && { color: color.white }]}>⋯</Text>
    </Pressable>
  );
}

export type MoreSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The sheet's heading ("More", "The lesson"…). */
  title?: string;
  children: ReactNode;
  /** Wider for a form or a list with numbers (default 460). */
  width?: number;
  testID?: string;
};

/** The sheet ⋯ opens: on the right, scrolls when long, closes by a tap outside, ✕, Esc or the system back. */
export function MoreSheet({ open, onClose, title = 'More', children, width = 460, testID }: MoreSheetProps) {
  useAppKey('escape', onClose, { enabled: open });
  return (
    <Modal visible={open} transparent animationType="fade" supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose} onShow={refocusKeyboard} onDismiss={refocusKeyboard}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" testID={testID ? `${testID}-scrim` : undefined}>
        <Pressable onPress={() => {}} style={[styles.sheetBox, { width }]} accessibilityViewIsModal>
          <Card style={styles.sheet} testID={testID}>
            <View style={styles.head}>
              <Display size={20} accessibilityRole="header" style={styles.title}>{title}</Display>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={slopFor(36)} testID={testID ? `${testID}-close` : undefined} style={styles.close}>
                <Text maxFontSizeMultiplier={1} style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** One row of a ⋯ sheet: what it does, a line under it, and the gesture or key that does it too. */
export function SheetItem({ emoji, label, sub, hint, onPress, disabled, testID, style }: {
  emoji?: string; label: string; sub?: string; hint?: string; onPress: () => void; disabled?: boolean; testID?: string; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={[label, sub, hint].filter(Boolean).join('. ')}
      accessibilityState={{ disabled: !!disabled }} style={({ pressed }) => [styles.item, pressed && styles.itemPressed, disabled && styles.dim, style]}>
      {emoji ? <Text style={styles.itemEmoji}>{emoji}</Text> : null}
      <View style={styles.itemText}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.itemLabel}>{label}</Text>
        {sub ? <Body size={13} color={color.muted}>{sub}</Body> : null}
      </View>
      {hint ? <View style={styles.hint}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.hintText}>{hint}</Text></View> : null}
    </Pressable>
  );
}

/** A small heading between groups of rows. */
export const SheetHeading = ({ children }: { children: string }) => <Label style={styles.heading}>{children}</Label>;

const styles = StyleSheet.create({
  more: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  moreNight: { backgroundColor: color.night, borderColor: color.white },
  moreText: { fontSize: 22, fontWeight: '900', color: color.ink, lineHeight: 24 },
  pressed: { transform: [{ translateX: 2 }, { translateY: 2 }] },
  scrim: { flex: 1, backgroundColor: 'rgba(20,20,20,0.35)', alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 84, paddingRight: 24, paddingBottom: 24 },
  sheetBox: { maxHeight: '100%' },
  sheet: { maxHeight: '100%', gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, fontWeight: '900', color: color.ink },
  body: { gap: 8, paddingBottom: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8, paddingHorizontal: 12, borderWidth: stroke.thin, borderColor: color.ink, backgroundColor: color.panel },
  itemPressed: { backgroundColor: color.cream },
  dim: { opacity: 0.45 },
  itemEmoji: { fontSize: 22, width: 28, textAlign: 'center' },
  itemText: { flex: 1, gap: 2 },
  itemLabel: { ...font.heavy, fontSize: 17, color: color.ink },
  hint: { backgroundColor: color.night, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  hintText: { ...font.heavy, fontSize: 12, color: color.pop },
  heading: { marginTop: 6 },
});
