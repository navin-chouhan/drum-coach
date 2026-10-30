// Setup's local pieces (mockup setup.html: .groupHead/.group/.li/.sym/.groupFoot), a − / + stepper for levels and
// notes (React Native has no slider), and the full-screen tool frame (the black bar on top, as the first run and the
// lesson player use). Candidates for the kit: Group/GroupRow, Stepper, ToolFrame.
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, DottedGround, Display, MAX_FONT_SCALE, color, font, hardShadow, shadow, slopFor, stroke, tabular } from '../../ui';

export function GroupHead({ children }: { children: string }) {
  return (
    <View style={styles.head}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header" style={styles.headText}>{children}</Text></View>
  );
}

export function Group({ title, foot, children, testID, style }: { title?: string; foot?: string; children: ReactNode; testID?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style} testID={testID}>
      {title ? <GroupHead>{title}</GroupHead> : null}
      <View style={styles.group}>{children}</View>
      {foot ? <Body size={13} style={styles.foot}>{foot}</Body> : null}
    </View>
  );
}

export type SymTone = 'green' | 'blue' | 'orange' | 'indigo' | 'gray' | 'teal' | 'yellow' | 'cream';
const SYM: Record<SymTone, string> = { green: color.good, blue: color.blue, orange: color.orange, indigo: color.teal, gray: '#8E8E93', teal: color.pop, yellow: '#FFB800', cream: color.cream };

/** One row of a group: an emoji box, a title with a small line under it, and something on the right. */
export function GroupRow({ emoji, sym = 'cream', title, sub, right, first, onPress, testID, accessibilityLabel, children }: {
  emoji?: string; sym?: SymTone; title?: string; sub?: string; right?: ReactNode; first?: boolean; onPress?: () => void; testID?: string;
  accessibilityLabel?: string; children?: ReactNode;
}) {
  const body = (
    <>
      {emoji ? <View style={[styles.sym, { backgroundColor: SYM[sym] }]}><Text style={styles.symText}>{emoji}</Text></View> : null}
      {title !== undefined ? (
        <View style={styles.grow}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.title} numberOfLines={1}>{title}</Text>
          {sub ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.sub} numberOfLines={2}>{sub}</Text> : null}
        </View>
      ) : null}
      {children}
      {right !== undefined ? <View style={styles.right}>{typeof right === 'string' ? <Text style={styles.val}>{right}</Text> : right}</View> : null}
    </>
  );
  const style = [styles.row, !first && styles.sep];
  if (!onPress) return <View style={style} testID={testID}>{body}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [title, sub].filter(Boolean).join(', ')}
      style={({ pressed }) => [...style, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

export const Chevron = () => <Text style={styles.chev}>›</Text>;

/** − value + (each press one step), for levels and MIDI notes. */
export function Stepper({ value, label, onStep, testID, width = 64 }: { value: string; label: string; onStep: (dir: -1 | 1) => void; testID?: string; width?: number }) {
  const btn = (dir: -1 | 1) => (
    <Pressable testID={testID ? `${testID}-${dir < 0 ? 'down' : 'up'}` : undefined} onPress={() => onStep(dir)} hitSlop={slopFor(36)}
      accessibilityRole="button" accessibilityLabel={`${label} ${dir < 0 ? 'down' : 'up'}`} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed]}>
      <Text style={styles.stepSign}>{dir < 0 ? '−' : '+'}</Text>
    </Pressable>
  );
  return (
    <View style={styles.stepper} accessible={false}>
      {btn(-1)}
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLabel={`${label}: ${value}`} style={[styles.stepVal, tabular, { width }]}>{value}</Text>
      {btn(1)}
    </View>
  );
}

/**
 * A full-screen tool over Setup (the pad wizard, soft then loud, latency, sound check, note map, kit test): the black
 * bar with the title and Close, on the dotted ground, without the sidebar.
 */
export function ToolFrame({ visible, title, onClose, children, testID, right }: { visible: boolean; title: string; onClose: () => void; children: ReactNode; testID?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" supportedOrientations={['landscape', 'landscape-left', 'landscape-right']} onRequestClose={onClose}>
      <DottedGround>
        <View style={[styles.bar, { paddingTop: Math.max(insets.top, 20), paddingLeft: insets.left + 26, paddingRight: insets.right + 24 }]}>
          <Display size={22} color={color.white} accessibilityRole="header" style={styles.barTitle} numberOfLines={1}>{title}</Display>
          {right}
          <Button label="Close" emoji="✕" onPress={onClose} testID={testID ? `${testID}-close` : undefined} />
        </View>
        <View testID={testID} style={[styles.toolBody, { paddingLeft: insets.left + 26, paddingRight: insets.right + 24, paddingBottom: Math.max(insets.bottom, 12) + 48 }]}>
          {children}
        </View>
      </DottedGround>
    </Modal>
  );
}

const styles = StyleSheet.create({
  head: { alignSelf: 'flex-start', backgroundColor: color.ink, paddingHorizontal: 9, paddingTop: 2, paddingBottom: 2, marginBottom: 8 },
  headText: { ...font.display, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', color: color.pop },
  group: { backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, boxShadow: hardShadow(shadow.card) },
  foot: { paddingTop: 7, paddingHorizontal: 4, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingVertical: 4, paddingHorizontal: 14 },
  sep: { borderTopWidth: stroke.thin, borderTopColor: color.separator },
  pressed: { backgroundColor: 'rgba(20,20,20,0.06)' },
  sym: { width: 34, height: 34, borderWidth: stroke.thin, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  symText: { fontSize: 18 },
  grow: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '600', color: color.ink },
  sub: { fontSize: 13, fontWeight: '600', color: color.muted, marginTop: 1 },
  right: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  val: { fontSize: 15, fontWeight: '600', color: color.muted, textAlign: 'right' },
  chev: { fontSize: 22, fontWeight: '700', color: color.faint, marginLeft: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { width: 40, height: 36, borderRadius: 999, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center' },
  stepSign: { fontSize: 20, fontWeight: '900', color: color.ink, lineHeight: 22 },
  stepVal: { ...font.display, fontSize: 17, textAlign: 'center', color: color.ink },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: color.night, paddingBottom: 14, borderBottomWidth: stroke.card, borderBottomColor: color.ink, boxShadow: `0px 5px 0px 0px ${color.pop}` },
  barTitle: { flex: 1 },
  toolBody: { flex: 1, paddingTop: 22 },
});
