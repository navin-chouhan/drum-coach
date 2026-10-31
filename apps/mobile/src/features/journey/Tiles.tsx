// Journey's tiles (the web's setTile / tileS buttons): an emoji, a bold name and a small line, the whole tile one
// button. Local to Journey (the kit has no tile); a candidate for promotion to src/ui.
import { StyleSheet, Text, View } from 'react-native';
import { Body, Card, color, type Tone } from '../../ui';

export function Tile({ emoji, title, sub, onPress, tone = 'white', testID, compact }: {
  emoji: string; title: string; sub?: string; onPress?: () => void; tone?: Tone; testID?: string; compact?: boolean;
}) {
  return (
    <Card tone={tone} elevation={3} onPress={onPress} testID={testID} accessibilityLabel={sub ? `${title}: ${sub}` : title}
      style={[styles.tile, compact && styles.compact, !onPress && styles.off]}>
      <Text style={styles.emoji} accessible={false}>{emoji}</Text>
      <View style={styles.text}>
        <Body size={14} weight="800" numberOfLines={1}>{title}</Body>
        {sub ? <Body size={12} color={color.muted} numberOfLines={compact ? 1 : 2}>{sub}</Body> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10 },
  compact: { minHeight: 44, paddingVertical: 6 },
  off: { opacity: 0.55 },
  emoji: { fontSize: 22 },
  text: { flex: 1, minWidth: 0 },
});
