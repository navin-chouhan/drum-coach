// A sidebar screen's top row (ipad.css .navbar): the title in a white box with a hard shadow, then optionally the
// coach's line, then buttons on the right. And ComingNext: the panel a screen shows until it is built.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Label } from './Card';
import { CoachLine } from './CoachLine';
import { Body, Display } from './Text';
import { color, hardShadow, shadow, stroke, type } from './tokens';

/** `coachLines`: let the coach's line take up to this many lines (fitted), for a long notice; one by default. */
export function TitleBar({ title, coach, right, testID, coachLines }: { title: string; coach?: ReactNode; right?: ReactNode; testID?: string; coachLines?: number }) {
  return (
    <View style={styles.bar} testID={testID}>
      <View style={styles.title}>
        <Display size={type.title} accessibilityRole="header" numberOfLines={1}>{title}</Display>
      </View>
      {coach ? <CoachLine size={type.coach} singleLine lines={coachLines} style={styles.coach}>{coach}</CoachLine> : <View style={styles.coach} />}
      {right}
    </View>
  );
}

/** "Coming next": what this screen will hold, in the kit's look, until its agent builds it. */
export function ComingNext({ title, what, emoji = '🚧', testID }: { title: string; what: string; emoji?: string; testID?: string }) {
  return (
    <Card testID={testID} style={styles.coming}>
      <Label>Coming next</Label>
      <Display size={type.hero}>{emoji} {title}</Display>
      <Body size={17}>{what}</Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, marginBottom: 12 },
  title: { backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, boxShadow: hardShadow(shadow.title), paddingHorizontal: 14, paddingTop: 7, paddingBottom: 6 },
  coach: { flex: 1, minWidth: 0 },
  coming: { gap: 12, maxWidth: 620, marginTop: 8, paddingVertical: 20, paddingHorizontal: 22 },
});
