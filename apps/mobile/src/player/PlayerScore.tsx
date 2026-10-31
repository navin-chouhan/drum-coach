// The results' score card (wireframe lesson-results-after.png): YOUR TAKE, a big 46/48 and the stars, one thing to fix
// with its button (🔁 Fix bar 2), "Ask the coach ›" as a link. The rest (share, the timing line, fills, the legend)
// lives in ⋯ or Details. `children` adds a screen's own lines (the ladder line, Practice's Details link).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Label, Stars, color, slopFor } from '../ui';

export type PlayerScoreProps = {
  /** "70 BPM" or "YOUR TAKE". */
  head: string;
  /** The big number ("46", or "92%") and what follows it ("/48"); scoreParts(landed, total) makes both. */
  big: string;
  of?: string;
  /** The words under it ("notes landed", "on the beat"). */
  label?: string;
  stars?: number;
  /** The one thing to fix, in a line. */
  fix?: string;
  /** Its button ("Fix bar 2"). */
  fixMove?: { label: string; onPress: () => void };
  onAskCoach?: () => void;
  testID?: string;
  fixTestID?: string;
  askTestID?: string;
  children?: ReactNode;
};

export function PlayerScore(p: PlayerScoreProps) {
  return (
    <Card style={styles.card} testID={p.testID ?? 'player-score'}>
      <Label>{p.head}</Label>
      <View style={styles.top} accessible accessibilityLabel={`${p.big}${p.of ?? ''} ${p.label ?? ''}`.trim()}>
        <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>{p.big}</Text>{p.of ? <Text style={styles.of}>{p.of}</Text> : null}
      </View>
      {p.label ? <Body size={15} weight="700">{p.label}</Body> : null}
      {p.stars !== undefined ? <Stars n={p.stars} size={30} /> : null}
      {p.fix ? <Body size={16} weight="700" testID={`${p.testID ?? 'player-score'}-fix`}>{p.fix}</Body> : null}
      {p.fixMove ? <Button emoji="🔁" label={p.fixMove.label} onPress={p.fixMove.onPress} testID={p.fixTestID ?? 'player-fix-move'} /> : null}
      {p.children}
      {p.onAskCoach ? (
        <Pressable onPress={p.onAskCoach} hitSlop={slopFor(20)} accessibilityRole="button" accessibilityLabel="Ask the coach: feedback and a drill for this take"
          testID={p.askTestID ?? 'player-ask-coach'}>
          <Text style={styles.link}>🧑‍🏫 Ask the coach ›</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'flex-end' },
  big: { fontSize: 76, lineHeight: 80, fontWeight: '900', color: color.ink, flexShrink: 1 },
  of: { fontSize: 28, fontWeight: '800', color: color.ink, marginBottom: 10, marginLeft: 2 },
  link: { fontSize: 16, fontWeight: '800', color: color.ink },
});
