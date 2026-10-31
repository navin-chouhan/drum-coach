// The results' score card (wireframe lesson-results-after.png): YOUR TAKE, a big 46/48 and the stars, one thing to fix
// with its button (🔁 Fix bar 2), "Ask the coach ›" as a link. The rest (share, the timing line, fills, the legend)
// lives in ⋯ or Details. `children` adds a screen's own line (a ladder chip, Practice's Details link).
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Label, Stars, color, slopFor } from '../ui';
import { scoreParts } from './model';

export type PlayerScoreProps = {
  /** "70 BPM" or "YOUR TAKE". */
  head: string;
  landed: number;
  total: number;
  /** A word under the number when it isn't "notes landed" (e.g. "clean bars"). */
  unit?: string;
  stars?: number;
  /** The one thing to fix, in a line. */
  fix?: string;
  /** Its button ("🔁 Fix bar 2"). */
  fixMove?: { label: string; onPress: () => void };
  onAskCoach?: () => void;
  testID?: string;
  children?: ReactNode;
};

export function PlayerScore(p: PlayerScoreProps) {
  const s = scoreParts(p.landed, p.total);
  return (
    <Card style={styles.card} testID={p.testID ?? 'player-score'}>
      <Label>{p.head}</Label>
      <View style={styles.top} accessible accessibilityLabel={`${p.landed} of ${p.total} ${p.unit ?? 'notes landed'}`}>
        <Text style={styles.big}>{s.big}</Text><Text style={styles.of}>{s.of}</Text>
      </View>
      {p.unit ? <Body size={14} weight="700">{p.unit}</Body> : null}
      {p.stars !== undefined ? <Stars n={p.stars} size={30} /> : null}
      {p.fix ? <Body size={16} weight="700" testID="player-fix">{p.fix}</Body> : null}
      {p.fixMove ? <Button emoji="🔁" label={p.fixMove.label} onPress={p.fixMove.onPress} testID="player-fix-move" /> : null}
      {p.children}
      {p.onAskCoach ? (
        <Pressable onPress={p.onAskCoach} hitSlop={slopFor(20)} accessibilityRole="button" accessibilityLabel="Ask the coach about this take" testID="player-ask-coach">
          <Text style={styles.link}>🧑‍🏫 Ask the coach ›</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-end' },
  big: { fontSize: 76, lineHeight: 80, fontWeight: '900', color: color.ink },
  of: { fontSize: 28, fontWeight: '800', color: color.ink, marginBottom: 10, marginLeft: 2 },
  link: { fontSize: 16, fontWeight: '800', color: color.ink },
});
