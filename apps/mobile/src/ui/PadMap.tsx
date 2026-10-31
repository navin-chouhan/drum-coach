// The kit from the throne (src/play kitLayout positions) as a map of spots: the one to hit big in yellow, done ones
// green with ✓, the rest dim in their drum colour. Promoted from features/pads/PadWizardView.tsx (A7c) by I2.
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { TOUCH_KIT, fitLayout, partBox } from '../play/kitLayout';
import { color, drumColor, font, hardShadow, stroke } from './tokens';

/** A spot: a drum ('hihat', 'snare', …) or the hi-hat pedal. */
export type PadSpot = 'kick' | 'snare' | 'hihat' | 'tom1' | 'tom2' | 'floor' | 'crash' | 'ride' | 'hhPedal';
export type PadSpotState = 'now' | 'ok' | 'waiting';

/** The spot a kit part stands for (the pedal is its own spot; every other part is its drum). */
export const spotOfPart = (part: { id: string; drum: string }): PadSpot => (part.id === 'hhPedal' ? 'hhPedal' : part.drum as PadSpot);

export function PadMap({ spots, style, testID }: { spots: Partial<Record<PadSpot, PadSpotState>>; style?: StyleProp<ViewStyle>; testID?: string }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const fit = useMemo(() => fitLayout(TOUCH_KIT, size.w, size.h), [size]);
  const done = Object.values(spots).filter(s => s === 'ok').length;
  return (
    <View style={[styles.map, style]} onLayout={onLayout} testID={testID} accessible accessibilityLabel={`Your kit from the throne: ${done} done`}>
      {fit.scale > 0 && TOUCH_KIT.parts.map(p => {
        const st = spots[spotOfPart(p)] ?? 'waiting';
        const box = partBox(p, fit);
        const round = p.kind === 'circle' ? box.width / 2 : p.radius * fit.scale;
        return (
          <View key={p.id} style={[styles.part, box, { borderRadius: round },
            st === 'now' ? { backgroundColor: color.pop, boxShadow: hardShadow(4, color.white) } : st === 'ok' ? { backgroundColor: color.good } : { backgroundColor: drumColor[p.drum], opacity: 0.35 }]}>
            <Text maxFontSizeMultiplier={1} numberOfLines={1} style={[styles.partLabel, { fontSize: Math.max(10, (st === 'now' ? 24 : 15) * fit.scale * 1.6) }, st === 'ok' && { color: color.white }]}>
              {st === 'ok' ? '✓ ' : ''}{p.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, alignSelf: 'stretch', marginTop: 4 },
  part: { position: 'absolute', borderWidth: stroke.card, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  partLabel: { ...font.display, color: color.ink },
});
