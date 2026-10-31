// Kit test's hit timeline (the web's Timeline): lanes with their names, the "now" line, and a dot per hit that slides
// left on the UI thread (the app's Clock as a shared value: no React render per frame; one render per hit).
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { getMidiPort } from '../../platform/midi';
import { useUiClock } from '../../play';
import { Body, color, drumColor, getAppHitBus, stroke } from '../../ui';
import { TIMELINE_LABEL_W, TIMELINE_LANES, TIMELINE_NOW_INSET, TIMELINE_TITLE, addTimelineHit, timelineDot, timelineX, type TimelineHit } from './timeline';

export function TimelineView({ height = 168 }: { height?: number }) {
  const clock = useUiClock(getMidiPort().clock.now);
  const [width, setWidth] = useState(0);
  const [hits, setHits] = useState<TimelineHit[]>([]);
  const key = useRef(0);
  useEffect(() => getAppHitBus().onHit(h => setHits(list => addTimelineHit(list, h, ++key.current))), []);
  const laneH = height / TIMELINE_LANES.length;
  return (
    <View style={styles.wrap} testID="kittest-timeline">
      <View style={styles.head}><Body size={13} weight="800">{TIMELINE_TITLE}</Body><Body size={13} weight="800">now →</Body></View>
      <View style={[styles.lanes, { height }]} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessible accessibilityLabel={`${TIMELINE_TITLE}: ${hits.length} hits`}>
        {TIMELINE_LANES.map((l, i) => (
          <View key={l.id} style={[styles.lane, { top: i * laneH, height: laneH }, i % 2 === 0 && styles.laneAlt]}>
            <View style={[styles.swatch, { backgroundColor: drumColor[l.id] }]} />
            <Text style={styles.laneName}>{l.name}</Text>
          </View>
        ))}
        {width ? <View style={[styles.now, { left: width - TIMELINE_NOW_INSET - 1 }]} /> : null}
        {width ? hits.map(h => <Dot key={h.key} hit={h} clock={clock} width={width} y={h.lane * laneH + laneH / 2} />) : null}
      </View>
    </View>
  );
}

const MAX_R = 15;
function Dot({ hit, clock, width, y }: { hit: TimelineHit; clock: SharedValue<number>; width: number; y: number }) {
  const { t, v } = hit;
  const style = useAnimatedStyle(() => {
    const age = clock.value - t;
    const x = timelineX(age, width), d = timelineDot(age, v);
    return { opacity: x < TIMELINE_LABEL_W ? 0 : d.opacity, transform: [{ translateX: x - MAX_R }, { translateY: y - MAX_R }, { scale: d.r / MAX_R }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.dot, { backgroundColor: drumColor[hit.drum] }, style]} />;
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  lanes: { position: 'relative', overflow: 'hidden', backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, borderRadius: 10 },
  lane: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, gap: 6 },
  laneAlt: { backgroundColor: color.cream },
  swatch: { width: 8, height: 8 },
  laneName: { fontSize: 11, fontWeight: '700', color: color.ink },
  now: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: color.ink },
  dot: { position: 'absolute', left: 0, top: 0, width: MAX_R * 2, height: MAX_R * 2, borderRadius: MAX_R, borderWidth: 1, borderColor: color.ink },
});
