// The on-screen multi-touch kit, for playing without the e-Drum (iPad mockups: touch-pads.png). Laid out like the
// MPS-150 from the throne. Each finger that lands sends a stroke to the hit bus (`emitPad`, the same path the kit
// takes) and plays its sound at once through the AudioPort (`playNow`). Several fingers at once work (hi-hat + kick).
//
// One touch surface hit-tests every finger itself (kitLayout.hitTest), so pads never fight over touches and the
// target sizes are checkable in tests. Feedback runs on shared values: no React state per touch.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import type { SoundId } from '@drum-coach/core/play/audioPort';
import type { DrumId, PadId } from './chartLike';
import { resultKind, type PlayResult, type Subscribe } from './events';
import { KitParts, useKitHandles } from './KitParts';
import { edgeDistance, fitLayout, hitTest, partForPad, toLayout, TOUCH_KIT, type KitLayout } from './kitLayout';
import { withoutKitSound } from './kitSounds';
import { IPAD_THEME, type PlayTheme } from './theme';
import { padForPart, padSound, strokeTime, touchVelocity, velocityGain, type HiHatMode, type VelocityMode } from './touch';
import { useLatest } from '../ui/useLatest';

export type TouchPadsProps = {
  /** The hit bus (the web's emitPad): pad, velocity 1–127, Clock ms of the stroke. */
  emitPad: (pad: PadId, velocity: number, time: number) => void;
  /** Plays the pad's sound now (AudioPort.playNow). Optional: without it the pads are silent. */
  playNow?: (sound: SoundId, gain: number) => number;
  /** The app's Clock. */
  now: () => number;
  /** The lesson's drums in colour, the rest grey (they still play). Undefined = all in colour. */
  activeDrums?: readonly DrumId[];
  /** Judged notes: the drum rings in the result colour. */
  results?: Subscribe<PlayResult>;
  velocity?: VelocityMode;
  fixedVelocity?: number;
  hihat?: HiHatMode;
  /** 'event': the touch's own timestamp when it's on the Clock (iOS); 'arrival': when JS gets it. */
  touchTime?: 'event' | 'arrival';
  theme?: PlayTheme;
  layout?: KitLayout;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function TouchPads(props: TouchPadsProps) {
  const { emitPad, playNow, now, results, theme = IPAD_THEME, layout = TOUCH_KIT } = props;
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(s => (s.w === width && s.h === height ? s : { w: width, h: height }));
  }, []);
  const fit = useMemo(() => fitLayout(layout, size.w, size.h), [layout, size]);
  const handles = useKitHandles();
  const pedalTouches = useRef(new Set<number>());

  // The latest props for the touch handler, without re-creating it.
  const cfgRef = useLatest(props);

  useEffect(() => {
    if (!results) return;
    return results(r => handles.current.get(r.lane)?.result(resultKind(r)));
  }, [results, handles]);

  const onTouchStart = useCallback((e: GestureResponderEvent) => {
    const c = cfgRef.current, clockNow = now();
    const touches = e.nativeEvent.changedTouches.map(t => {
      const [x, y] = toLayout(t.locationX, t.locationY, fit);
      return { t, x, y, part: hitTest(layout, x, y) };
    });
    // Pedal first, so a hi-hat landing with it in the same event already sees it held.
    for (const { t, part } of touches) if (part?.id === 'hhPedal') pedalTouches.current.add(t.identifier);
    for (const { t, x, y, part } of touches) {
      if (!part) continue;
      const pad = padForPart(part, c.hihat ?? 'closed', pedalTouches.current.size > 0);
      const velocity = touchVelocity(c.velocity ?? 'auto', { force: t.force, edge: edgeDistance(part, x, y), fixed: c.fixedVelocity });
      const time = (c.touchTime ?? 'event') === 'event' ? strokeTime(t.timestamp, clockNow) : clockNow;
      playNow?.(padSound(pad), velocityGain(velocity)); // sound first: it's what the player waits for
      withoutKitSound(() => emitPad(pad, velocity, time)); // sounded just above: not again by the app's kit sounds
      const h = handles.current.get(partForPad(layout, pad));
      h?.hit(velocity, pad);
      h?.touch(x, y);
    }
  }, [now, fit, layout, playNow, emitPad, handles, cfgRef]);

  const onTouchEnd = useCallback((e: GestureResponderEvent) => {
    for (const t of e.nativeEvent.changedTouches) pedalTouches.current.delete(t.identifier);
  }, []);

  const labelSize = Math.max(14, 24 * fit.scale);
  return (
    <View
      style={[{ flex: 1 }, props.style]}
      onLayout={onLayout}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      pointerEvents="box-only"
      testID={props.testID}
      accessible
      accessibilityLabel="Touch drum pads"
      accessibilityHint="Tap a pad to play it. Two fingers play two pads together."
    >
      {fit.scale > 0 && <KitParts layout={layout} fit={fit} theme={theme} activeDrums={props.activeDrums} labelSize={labelSize} sweetSpot handles={handles} />}
    </View>
  );
}
