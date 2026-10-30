// The kit seen from the throne, lighting up on every stroke and ringing in the result colour when a note is judged
// (iPad mockups: lesson-take.png). Driven by streams through shared values: no React state per hit.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { DrumId, PadId } from './chartLike';
import { resultKind, type PadHit, type PlayResult, type Subscribe } from './events';
import { KitParts, useKitHandles } from './KitParts';
import { fitLayout, hitTest, MINI_KIT, partForPad, toLayout, type KitLayout } from './kitLayout';
import { IPAD_THEME, type PlayTheme } from './theme';

export type KitViewProps = {
  /** Every stroke (kit, touch pads, replay). */
  hits: Subscribe<PadHit>;
  /** Judged notes and extras: the drum rings in the result colour. */
  results?: Subscribe<PlayResult>;
  /** The lesson's drums in colour, the rest grey. Undefined = all in colour. */
  activeDrums?: readonly DrumId[];
  theme?: PlayTheme;
  layout?: KitLayout;
  /** Tap a drum to play it (like clicking a pad on the web). The hi-hat sends closed. */
  onPadPress?: (pad: PadId) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function KitView({ hits, results, activeDrums, theme = IPAD_THEME, layout = MINI_KIT, onPadPress, style, testID }: KitViewProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(s => (s.w === width && s.h === height ? s : { w: width, h: height }));
  }, []);
  const fit = useMemo(() => fitLayout(layout, size.w, size.h), [layout, size]);
  const handles = useKitHandles();

  useEffect(() => hits(h => handles.current.get(partForPad(layout, h.pad))?.hit(h.velocity, h.pad)), [hits, layout, handles]);
  useEffect(() => {
    if (!results) return;
    return results(r => handles.current.get(r.lane)?.result(resultKind(r)));
  }, [results, handles]);

  const onTouchStart = useCallback((e: GestureResponderEvent) => {
    if (!onPadPress) return;
    for (const t of e.nativeEvent.changedTouches) {
      const [x, y] = toLayout(t.locationX, t.locationY, fit);
      const part = hitTest(layout, x, y);
      if (part) onPadPress(part.id === 'hhPedal' ? 'hhPedal' : part.drum === 'hihat' ? 'hhClosed' : (part.drum as PadId));
    }
  }, [onPadPress, fit, layout]);

  const labelSize = Math.max(9, 11 * fit.scale * (layout === MINI_KIT ? 1 : 2));
  return (
    <View
      style={[{ flex: 1 }, style]}
      onLayout={onLayout}
      onTouchStart={onPadPress ? onTouchStart : undefined}
      pointerEvents={onPadPress ? 'box-only' : 'none'}
      testID={testID}
      accessibilityLabel="Drum kit"
    >
      {fit.scale > 0 && <KitParts layout={layout} fit={fit} theme={theme} activeDrums={activeDrums} labelSize={labelSize} handles={handles} />}
    </View>
  );
}
