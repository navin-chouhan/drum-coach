// The drawn kit shared by KitView and TouchPads: one view per drum, animated with Reanimated shared values. A hit or a
// result calls the drum's handle (no React state, no re-render); the animation then runs on the UI thread.
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming,
} from 'react-native-reanimated';
import type { DrumId, PadId } from './chartLike';
import { partBox, type Fit, type KitLayout, type KitPart, type KitPartId } from './kitLayout';
import type { PlayTheme, ResultKind } from './theme';

/** What a drawn drum can be told to do. */
export type PartHandle = {
  hit(velocity: number, pad: PadId): void;
  result(kind: ResultKind): void;
  /** A finger landed here (design units): the ripple under it. */
  touch(x: number, y: number): void;
};

export type KitHandles = Map<KitPartId, PartHandle>;

const isCymbal = (d: DrumId) => d === 'crash' || d === 'ride' || d === 'hihat';

type PartProps = {
  part: KitPart;
  fit: Fit;
  theme: PlayTheme;
  lit: boolean;
  labelSize: number;
  sweetSpot: boolean;
  register: (id: KitPartId, h: PartHandle | null) => void;
};

const DrumPart = memo(function DrumPart({ part, fit, theme, lit, labelSize, sweetSpot, register }: PartProps) {
  const reduceMotion = useReducedMotion();
  const b = partBox(part, fit);
  const radius = part.kind === 'circle' ? b.width / 2 : part.radius * fit.scale;
  const color = lit ? theme.drum[part.drum] : theme.idle;
  const pedal = part.id === 'hhPedal';
  const fillColor = pedal && lit ? darken(theme.drum.hihat) : color;

  const glow = useSharedValue(0), squash = useSharedValue(1), tilt = useSharedValue(0), open = useSharedValue(0);
  const ring = useSharedValue(0), ringColor = useSharedValue('transparent');
  const rip = useSharedValue(0), ripX = useSharedValue(0), ripY = useSharedValue(0);

  useEffect(() => {
    const handle: PartHandle = {
      hit(velocity, pad) {
        const v = Math.max(0.15, Math.min(1, velocity / 127));
        const cym = isCymbal(part.drum) && pad !== 'hhPedal';
        glow.value = withSequence(withTiming(0.25 + 0.6 * v, { duration: 0 }), withTiming(0, { duration: cym ? 900 : 420, easing: Easing.out(Easing.quad) }));
        if (part.drum === 'hihat') open.value = withTiming(pad === 'hhOpen' ? 1 : 0, { duration: 120 });
        if (reduceMotion) return;
        if (cym) {
          const dir = Math.random() < 0.5 ? -1 : 1, amt = (part.drum === 'hihat' ? 5 : 10) * v;
          tilt.value = withSequence(
            withTiming(dir * amt, { duration: 60 }), withTiming(-dir * amt * 0.5, { duration: 180 }),
            withTiming(dir * amt * 0.2, { duration: 220 }), withTiming(0, { duration: 260 }),
          );
        } else {
          squash.value = withSequence(withTiming(1 - 0.07 * v, { duration: 40 }), withTiming(1 + 0.015 * v, { duration: 90 }), withTiming(1, { duration: 130 }));
        }
      },
      result(kind) {
        ringColor.value = theme.result[kind];
        ring.value = withSequence(withTiming(1, { duration: 0 }), withTiming(1, { duration: 250 }), withTiming(0, { duration: 400 }));
      },
      touch(x, y) {
        ripX.value = (x - part.cx) * fit.scale;
        ripY.value = (y - part.cy) * fit.scale;
        rip.value = withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 450, easing: Easing.out(Easing.quad) }));
      },
    };
    register(part.id, handle);
    return () => register(part.id, null);
  }, [part, fit.scale, theme, reduceMotion, register, glow, squash, tilt, open, ring, ringColor, rip, ripX, ripY]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -4 * open.value }, { translateY: -6 * open.value }, { rotate: `${tilt.value}deg` }, { scale: squash.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const lowerStyle = useAnimatedStyle(() => ({ opacity: open.value * 0.55 }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value, borderColor: ringColor.value }));
  const ripStyle = useAnimatedStyle(() => ({
    opacity: rip.value > 0 && rip.value < 1 ? 0.9 * (1 - rip.value) : 0,
    transform: [{ translateX: ripX.value }, { translateY: ripY.value }, { scale: 0.6 + 0.8 * rip.value }],
  }));

  const pad = 7 * Math.max(0.4, fit.scale);
  const box: ViewStyle = { position: 'absolute', left: b.left, top: b.top, width: b.width, height: b.height };
  const ripD = Math.min(84, Math.min(b.width, b.height) * 0.9);
  return (
    <View pointerEvents="none" style={box}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: theme.drum[part.drum], transform: [{ scale: 1.12 }] }, glowStyle]} />
      {part.drum === 'hihat' && !pedal && (
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: color }, lowerStyle]} />
      )}
      <Animated.View style={[StyleSheet.absoluteFill, styles.center, { borderRadius: radius, backgroundColor: fillColor }, bodyStyle]}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: 'rgba(255,255,255,0.14)', transform: [{ scale: 0.92 }, { translateX: -b.width * 0.04 }, { translateY: -b.height * 0.05 }] }]} />
        {sweetSpot && part.kind === 'circle' && (
          <View style={[styles.sweet, { width: b.width * 0.45, height: b.width * 0.45, borderRadius: b.width * 0.225, borderColor: lit ? 'rgba(255,255,255,0.35)' : 'rgba(60,60,67,0.12)' }]} />
        )}
        <Text numberOfLines={1} style={[styles.label, { fontSize: labelSize * (lit ? 1 : 0.8), color: lit ? theme.padText : theme.idleText }]}>
          {pedal ? `${part.label} (hold)` : part.label}
        </Text>
      </Animated.View>
      <Animated.View style={[styles.abs, { left: -pad, top: -pad, right: -pad, bottom: -pad, borderRadius: radius + pad, borderWidth: Math.max(3, 5 * fit.scale) }, ringStyle]} />
      <Animated.View
        style={[
          styles.abs,
          { left: b.width / 2 - ripD / 2, top: b.height / 2 - ripD / 2, width: ripD, height: ripD, borderRadius: ripD / 2, borderWidth: 5, borderColor: theme.result.onIt, backgroundColor: 'rgba(255,255,255,0.45)' },
          ripStyle,
        ]}
      />
    </View>
  );
});

/** #RRGGBB → 25 % darker (the pedal strip under the hi-hat). */
function darken(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16), f = (c: number) => Math.round(c * 0.75).toString(16).padStart(2, '0');
  return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

export type KitPartsProps = {
  layout: KitLayout;
  fit: Fit;
  theme: PlayTheme;
  /** Drums drawn in colour; the rest are grey (and still play). Undefined = all in colour. */
  activeDrums?: readonly DrumId[];
  labelSize: number;
  sweetSpot?: boolean;
  /** Receives the handles to drive the drums. */
  handles: React.RefObject<KitHandles>;
  style?: StyleProp<ViewStyle>;
};

export function KitParts({ layout, fit, theme, activeDrums, labelSize, sweetSpot = false, handles }: KitPartsProps) {
  const register = useCallback((id: KitPartId, h: PartHandle | null) => {
    if (h) handles.current.set(id, h);
    else handles.current.delete(id);
  }, [handles]);
  const active = useMemo(() => (activeDrums ? new Set(activeDrums) : null), [activeDrums]);
  return (
    <>
      {layout.parts.map(p => (
        <DrumPart key={p.id} part={p} fit={fit} theme={theme} lit={!active || active.has(p.drum)} labelSize={labelSize} sweetSpot={sweetSpot} register={register} />
      ))}
    </>
  );
}

/** Handles keyed by part, for KitView and TouchPads. */
export const useKitHandles = () => useRef<KitHandles>(new Map());

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  label: { fontWeight: '700', textAlign: 'center' },
  sweet: { position: 'absolute', borderWidth: 2, borderStyle: 'dashed' },
});
