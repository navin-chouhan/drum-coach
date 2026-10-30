// The one-bar groove drawing on Journey's lesson panel (journey.html .preview): lanes of notes on the count grid,
// the new limb's lane highlighted, the app's lanes faded. Plain views: no SVG in this build.
import { StyleSheet, Text, View } from 'react-native';
import { color, drumColor } from '../../ui';
import type { GroovePreview as Preview } from './preview';

const LABEL_W = 46, LANE_H = 24, COUNT_H = 20;

export function GroovePreview({ preview, width = 272 }: { preview: Preview; width?: number }) {
  const gridW = width - LABEL_W - 2;
  const slots = preview.count.length;
  const w = gridW / slots;
  const spoken = `${preview.caption}. ${preview.lanes.map(l => `${l.label}${l.yours ? '' : ' (the app plays it)'} on ${l.slots.map(i => preview.count[i]).join(' ')}`).join('. ')}`;
  return (
    <View style={styles.box} accessible accessibilityRole="image" accessibilityLabel={`${spoken}${preview.newLabel ? `. ${preview.newLabel}` : ''}`}>
      <View style={styles.cap}>
        <Text maxFontSizeMultiplier={1} style={styles.capText} numberOfLines={1}>{preview.caption}</Text>
        {preview.newLabel ? <Text maxFontSizeMultiplier={1} style={styles.capText}>{preview.newLabel}</Text> : null}
      </View>
      <View style={{ width, height: preview.lanes.length * LANE_H + COUNT_H }}>
        {preview.lanes.map((lane, r) => {
          const cy = r * LANE_H + LANE_H / 2;
          const kick = lane.drum === 'kick';
          return (
            <View key={lane.drum}>
              <Text maxFontSizeMultiplier={1} style={[styles.lane, { top: cy - 8 }]}>{lane.label}</Text>
              {lane.isNew
                ? <View style={[styles.band, { left: LABEL_W, width: gridW, top: cy - 10 }]} />
                : <View style={[styles.line, { left: LABEL_W, width: gridW, top: cy - 1 }]} />}
              {lane.slots.map(i => {
                const cx = LABEL_W + (i + 0.5) * w;
                const fill = drumColor[lane.drum];
                const style = kick
                  ? { left: cx - 9, top: cy - 7.5, width: 18, height: 15, borderRadius: 3 }
                  : { left: cx - 8, top: cy - 8, width: 16, height: 16, borderRadius: 8 };
                return <View key={i} style={[styles.note, style, { backgroundColor: fill, opacity: lane.yours ? 1 : 0.35 }]} />;
              })}
            </View>
          );
        })}
        {preview.count.map((c, i) => (
          <Text key={i} maxFontSizeMultiplier={1}
            style={[styles.count, { left: LABEL_W + i * w, width: w, top: preview.lanes.length * LANE_H }, /^\d/.test(c) ? null : styles.countAnd]}>{c}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: color.panel, borderWidth: 3, borderColor: color.ink, paddingTop: 6, paddingHorizontal: 8, paddingBottom: 4 },
  cap: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 2 },
  capText: { fontSize: 12, fontWeight: '800', color: color.ink },
  lane: { position: 'absolute', left: 0, fontSize: 11, fontWeight: '800', color: color.ink },
  line: { position: 'absolute', height: 2, backgroundColor: 'rgba(20,20,20,0.18)' },
  band: { position: 'absolute', height: 20, backgroundColor: color.pop, borderWidth: 2, borderColor: color.ink },
  note: { position: 'absolute', borderWidth: 2.5, borderColor: color.ink },
  count: { position: 'absolute', textAlign: 'center', fontSize: 14, lineHeight: 20, fontWeight: '900', color: color.ink },
  countAnd: { color: color.blue },
});
