// The coach's pieces (mockups coach, coach-offline): the comic SpeechBubble with the mascot, the OfflineCard (what
// failed, with its moves) and the KeepsWorkingCard ("Everything else keeps working"). Promoted from
// features/coach/CoachPanel.tsx (A7e) by I2. They only draw: the coach's state and wording come from features/coach.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Mascot } from './CoachLine';
import { splitHost } from './kitMath';
import { Body, Display, MAX_FONT_SCALE } from './Text';
import { color, hardShadow } from './tokens';

/** A white comic bubble beside the mascot (grey mascot: a line from the app, not the coach). */
export function SpeechBubble({ children, grey, testID }: { children: ReactNode; grey?: boolean; testID?: string }) {
  return (
    <View style={styles.msg} testID={testID}>
      <View style={grey ? styles.greyMascot : undefined}><Mascot size="sm" /></View>
      <View style={styles.bubble}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.bubbleText}>{children}</Text></View>
    </View>
  );
}

/** A line with the server's host in mono, as drawn. Plain text otherwise (no markup parsing). */
export function HostText({ line, host }: { line: string; host?: string }) {
  const parts = splitHost(line, host);
  if (!parts) return <>{line}</>;
  return <>{parts.before}<Text style={styles.mono}>{parts.host}</Text>{parts.after}</>;
}

/** What failed (the coach server unreachable, logged out…): a yellow head, its lines, and its moves as children. */
export function OfflineCard({ title, lines, host, children, testID = 'coach-problem' }: { title: string; lines: readonly string[]; host?: string; children?: ReactNode; testID?: string }) {
  return (
    <View style={styles.warn} testID={testID} accessibilityLiveRegion="polite">
      <View style={styles.warnHead}><Display size={19}>⚠️ {title}</Display></View>
      {lines.map(l => <Body key={l} size={14.5}><HostText line={l} host={host} /></Body>)}
      {children ? <View style={styles.row}>{children}</View> : null}
    </View>
  );
}

/** The green card under a problem: what still works without the coach. */
export function KeepsWorkingCard({ items, title = 'Everything else keeps working', testID = 'coach-keeps-working' }: { items: readonly string[]; title?: string; testID?: string }) {
  return (
    <View style={styles.ok} testID={testID}>
      <Display size={15}>{title}</Display>
      {items.map(k => <Body key={k} size={14} weight="700"><Text style={styles.check}>✓ </Text>{k}</Body>)}
    </View>
  );
}

const styles = StyleSheet.create({
  msg: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  greyMascot: { opacity: 0.5 },
  bubble: { flexShrink: 1, maxWidth: 344, backgroundColor: color.panel, borderWidth: 3, borderColor: color.ink, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomRightRadius: 18, borderBottomLeftRadius: 4, paddingVertical: 9, paddingHorizontal: 13, boxShadow: hardShadow(4) },
  bubbleText: { fontSize: 15.5, fontWeight: '600', lineHeight: 21, color: color.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  warn: { gap: 7, backgroundColor: color.panel, borderWidth: 3, borderColor: color.ink, boxShadow: hardShadow(5), paddingVertical: 12, paddingHorizontal: 14 },
  warnHead: { alignSelf: 'flex-start', backgroundColor: color.pop, borderWidth: 2, borderColor: color.ink, paddingVertical: 4, paddingHorizontal: 8 },
  mono: { fontFamily: 'Menlo', fontSize: 13, fontWeight: '700', backgroundColor: color.cream },
  ok: { gap: 5, backgroundColor: color.goodSoft, borderWidth: 3, borderColor: color.ink, boxShadow: hardShadow(4), paddingVertical: 10, paddingHorizontal: 14 },
  check: { color: color.good, fontWeight: '900' },
});
