// The black sidebar (the web's black top bar, turned on its side: landscape runs out of height, not width): the brand
// mark, the four sections (D10: Journey · Practice · You · Setup) as pills, yellow when selected, an optional dev row,
// « / » to collapse it, and the one kit dot at the bottom. Two modes: expanded (names, 228 pt) and the icon rail
// (84 pt: icons and the dot). Players, the first run and full-screen tools hide it (they are outside app/(main)).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { slopFor } from './controls';
import type { SidebarMode } from './nav';
import type { Dot, KitDot } from './status';
import { MAX_FONT_SCALE } from './Text';
import { color, FRAME, font, hardShadow, stroke } from './tokens';

export type SidebarItem = { key: string; label: string; emoji: string; testID?: string };

export type SidebarProps = {
  items: SidebarItem[];
  current: string;
  onSelect: (key: string) => void;
  /** Expanded (names) or the icon rail. */
  mode: SidebarMode;
  /** « / » (the layout wires the `\` key to the same). */
  onToggle: () => void;
  kit: KitDot;
  /** Tapping the kit dot (opens Setup). */
  onKitPress?: () => void;
  /** Drawn between the sections and the bottom (the dev row in debug builds; expanded only). */
  extra?: ReactNode;
  /** testID on the "Drum Coach" brand text (the launch smoke test looks for it). */
  brandTestID?: string;
};

export const RAIL_WIDTH = 84;
const DOT: Record<Dot, string> = { on: color.good, off: '#9A9A9A', warn: color.orange, bad: color.bad };

export function Sidebar({ items, current, onSelect, mode, onToggle, kit, onKitPress, extra, brandTestID }: SidebarProps) {
  const insets = useSafeAreaInsets();
  const rail = mode === 'rail';
  return (
    <View testID={`sidebar-${mode}`} style={[styles.bar, rail ? styles.barRail : { paddingLeft: insets.left + 14 },
      { paddingTop: Math.max(insets.top, 20) + 10, paddingBottom: Math.max(insets.bottom, 12) + 24 }]}
      accessibilityRole="tablist">
      <View style={[styles.brand, rail && styles.brandRail]}>
        <View style={styles.logo} />
        {rail ? null : <Text testID={brandTestID} maxFontSizeMultiplier={1} style={styles.brandText} accessibilityRole="header">Drum Coach</Text>}
      </View>
      {items.map(it => {
        const on = it.key === current;
        return (
          <Pressable key={it.key} testID={it.testID} onPress={() => onSelect(it.key)}
            accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={it.label}
            style={({ pressed }) => [styles.item, rail && styles.itemRail, on && styles.itemOn, pressed && !on && styles.itemPressed]}>
            <Text style={[styles.itemEmoji, rail && styles.itemEmojiRail]}>{it.emoji}</Text>
            {rail ? null : <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={[styles.itemText, on && styles.itemTextOn]}>{it.label}</Text>}
          </Pressable>
        );
      })}
      <View style={styles.spacer} />
      {rail ? null : extra}
      <Pressable testID="sidebar-toggle" onPress={onToggle} hitSlop={slopFor(44)} accessibilityRole="button"
        accessibilityLabel={rail ? 'Show the sidebar' : 'Hide the sidebar'} accessibilityHint="Or the backslash key"
        style={[styles.toggle, rail && styles.toggleRail]}>
        <View style={styles.toggleRound}><Text maxFontSizeMultiplier={1} style={styles.toggleText}>{rail ? '»' : '«'}</Text></View>
        {rail ? null : <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.toggleLabel}>Hide sidebar (\)</Text>}
      </Pressable>
      <Pressable testID="sidebar-kit" onPress={onKitPress} disabled={!onKitPress} hitSlop={slopFor(40)}
        accessibilityRole={onKitPress ? 'button' : 'text'} accessibilityLabel={kit.accessibilityLabel}
        style={[styles.kit, rail && styles.kitRail]}>
        <View style={[styles.dot, { backgroundColor: DOT[kit.dot] }, kit.dot === 'on' && styles.dotGlow]} />
        {rail ? null : <>
          <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.kitName}>{kit.name}</Text>
          <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.kitValue}>{kit.value}</Text>
        </>}
      </Pressable>
    </View>
  );
}

/** A small row of dev links (debug builds only), in the sidebar's ink. */
export function DevRow({ links }: { links: { label: string; onPress: () => void; testID?: string }[] }) {
  return (
    <View style={styles.dev}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.devTitle}>Dev</Text>
      <View style={styles.devLinks}>
        {links.map(l => (
          <Pressable key={l.label} testID={l.testID} onPress={l.onPress} accessibilityRole="link" hitSlop={slopFor(30)} style={styles.devLink}>
            <Text maxFontSizeMultiplier={1} style={styles.devLinkText}>{l.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: FRAME.sidebar, height: '100%', backgroundColor: color.night, borderRightWidth: stroke.card, borderRightColor: color.ink,
    boxShadow: `${FRAME.sidebarShadow}px 0px 0px 0px ${color.pop}`, paddingRight: 14, gap: 6, zIndex: 2,
  },
  barRail: { width: RAIL_WIDTH, paddingRight: 0, alignItems: 'center', gap: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 16 },
  brandRail: { paddingHorizontal: 0, justifyContent: 'center' },
  logo: { width: 16, height: 16, borderRadius: 8, backgroundColor: color.teal, borderWidth: 3, borderColor: color.pop },
  brandText: { ...font.display, fontSize: 21, letterSpacing: 0.4, color: color.nightText },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 50, paddingHorizontal: 14, borderRadius: 999 },
  itemRail: { width: 58, height: 58, paddingHorizontal: 0, justifyContent: 'center', borderRadius: 16 },
  itemOn: { backgroundColor: color.pop, boxShadow: hardShadow(3, 'rgba(255,255,255,0.33)') },
  itemPressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  itemEmoji: { fontSize: 21, width: 26, textAlign: 'center' },
  itemEmojiRail: { fontSize: 26, width: 34 },
  itemText: { ...font.display, fontSize: 17, letterSpacing: 0.2, color: color.nightText },
  itemTextOn: { color: color.ink },
  spacer: { flex: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 8, marginBottom: 10 },
  toggleRail: { paddingHorizontal: 0, justifyContent: 'center' },
  toggleRound: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#9A9A9A', alignItems: 'center', justifyContent: 'center' },
  toggleText: { color: color.white, fontSize: 20, fontWeight: '900', lineHeight: 22 },
  toggleLabel: { color: '#BDBDBD', fontSize: 14, fontWeight: '700' },
  kit: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: color.panel, borderWidth: stroke.thin, borderColor: color.ink,
  },
  kitRail: { width: 44, height: 44, paddingHorizontal: 0, paddingVertical: 0, justifyContent: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotGlow: { boxShadow: `0px 0px 6px 0px ${color.good}` },
  kitName: { fontSize: 14, fontWeight: '800', color: color.ink, flexShrink: 1 },
  kitValue: { marginLeft: 'auto', fontSize: 13, color: color.muted, fontWeight: '600' },
  dev: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: 8, marginBottom: 12, gap: 4 },
  devTitle: { color: '#9A9A9A', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 8 },
  devLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  devLink: { paddingHorizontal: 8, paddingVertical: 6 },
  devLinkText: { color: color.pop, fontSize: 13, fontWeight: '800' },
});
