// The note highway: the chart scrolling past a now line, judged notes lighting up. Screen-independent: a screen gives it
// a chart, the take's tempo and beat-0 time on the Clock, and a results stream.
//
// Per frame nothing goes through React: a Reanimated frame callback (useUiClock) sets the Clock time on the UI thread,
// the position and scroll are derived from it there, and the renderer's animated styles read them. React renders when
// the visible pages change (once every few bars) and when a result arrives.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { DRUM_NAME, type ChartLike, type DrumId } from './chartLike';
import type { PlayResult, Subscribe } from './events';
import {
  buildPage, highwayDefaults, highwayLayout, lanesFor, msPerBeat, pageSpan, positionAt, scrollFor, visiblePages,
  type HighwayOptions, type PageScene,
} from './geometry';
import { addMarker, markerFor, type MarkerGlyph } from './markers';
import { HighwayRenderer, type LaneFlashes } from './render';
import { IPAD_THEME, type PlayTheme } from './theme';
import { useUiClock } from './useUiClock';

export type NoteHighwayProps = {
  chart: ChartLike;
  /** The take's tempo (the chart's bpm × speed). */
  bpm: number;
  /** Clock ms when beat 0 is heard (the end of the count-in). */
  zero: number;
  /** The app's Clock (iOS: MidiPort.clock.now; tests and the dev screen: any monotonic ms). */
  now: () => number;
  /** Input latency (ms) the take engine removes from strokes; extra strokes are drawn where they were meant. */
  latencyMs: number;
  /** Judged notes and extra strokes from the take engine. */
  results?: Subscribe<PlayResult>;
  /** Flow, lane order, which lanes, pixels per beat, … (defaults: the iPad mockups, leftward). */
  options?: Partial<HighwayOptions>;
  theme?: PlayTheme;
  /** Share one UI-thread clock between surfaces (from useUiClock); otherwise the highway makes its own. */
  clock?: SharedValue<number>;
  /** How far ahead of the frame callback a frame is shown (ms), when `clock` isn't given. */
  displayLeadMs?: number;
  laneName?: (lane: DrumId) => string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const NO_FLASH = (n: number): LaneFlashes => ({ at: Array.from({ length: n }, () => -Infinity), color: Array.from({ length: n }, () => 'transparent') });

export function NoteHighway(props: NoteHighwayProps) {
  const { chart, bpm, zero, now, latencyMs, results, theme = IPAD_THEME } = props;
  const o: HighwayOptions = useMemo(() => ({ ...highwayDefaults(props.options?.flow ?? 'leftward'), ...props.options }), [props.options]);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(s => (s && s.w === width && s.h === height ? s : { w: width, h: height }));
  }, []);

  const ownClock = useUiClock(now, { displayLeadMs: props.displayLeadMs, enabled: !props.clock });
  const clock = props.clock ?? ownClock;
  const beatMs = msPerBeat(bpm);

  const lanes = useMemo(() => lanesFor(chart.notes, o), [chart.notes, o]);
  const layout = useMemo(() => (size ? highwayLayout(size.w, size.h, lanes, o) : null), [size, lanes, o]);
  const span = useMemo(() => pageSpan(chart, o), [chart, o]);

  // Timing on the UI thread.
  const zeroSv = useSharedValue(zero), beatMsSv = useSharedValue(beatMs);
  useEffect(() => {
    zeroSv.value = zero;
    beatMsSv.value = beatMs;
  }, [zero, beatMs, zeroSv, beatMsSv]);
  const pos = useDerivedValue(() => positionAt(clock.value, zeroSv.value, beatMsSv.value));
  const nowAt = layout?.nowAt ?? 0, px = layout?.pxPerBeat ?? 1, sign = layout?.sign ?? 1;
  const scroll = useDerivedValue(() => scrollFor(pos.value, nowAt, px, sign), [nowAt, px, sign]);

  // Pages: React hears about it only when the visible range changes.
  const past = layout?.pastBeats ?? 4, future = layout?.futureBeats ?? 8;
  const [range, setRange] = useState<[number, number]>(() => visiblePages(positionAt(now(), zero, beatMs), past, future, span));
  const setRangeIfNew = useCallback((a: number, b: number) => setRange(r => (r[0] === a && r[1] === b ? r : [a, b])), []);
  useAnimatedReaction(
    () => visiblePages(pos.value, past, future, span),
    (cur, prev) => {
      if (prev && cur[0] === prev[0] && cur[1] === prev[1]) return;
      scheduleOnRN(setRangeIfNew, cur[0], cur[1]);
    },
    [past, future, span],
  );
  // Built pages, kept while what they're drawn from stays the same (a new cache in the same render as the change).
  const pageCache = useMemo(() => new Map<number, PageScene>(), [layout, chart, span, theme, o]);
  const pages = useMemo(() => {
    if (!layout) return [];
    const out: PageScene[] = [];
    for (let p = range[0]; p <= range[1]; p++) {
      let page = pageCache.get(p);
      if (!page) {
        page = buildPage(p, chart, layout, span, theme, o);
        pageCache.set(p, page);
      }
      out.push(page);
    }
    return out;
  }, [layout, range, chart, span, theme, o, pageCache]);

  // Results: markers (React, once per result) and now-line flashes (shared values).
  const [markers, setMarkers] = useState<MarkerGlyph[]>([]);
  const flashes = useSharedValue<LaneFlashes>(NO_FLASH(lanes.length));
  useEffect(() => {
    setMarkers([]);
    flashes.value = NO_FLASH(lanes.length);
  }, [chart, zero, lanes.length, flashes]);
  const ctx = useRef({ chart, layout, theme, zero, beatMs, latencyMs, lanes });
  ctx.current = { chart, layout, theme, zero, beatMs, latencyMs, lanes };
  useEffect(() => {
    if (!results) return;
    let seq = 0;
    return results(r => {
      const c = ctx.current;
      if (!c.layout) return;
      const m = markerFor(r, { notes: c.chart.notes, layout: c.layout, theme: c.theme, zero: c.zero, beatMs: c.beatMs, latencyMs: c.latencyMs }, seq++);
      if (m) setMarkers(list => addMarker(list, m));
      const lane = c.lanes.indexOf(r.lane);
      if (lane >= 0 && r.kind === 'judged' && r.judgement !== 'miss' && m) {
        const f = flashes.value, at = [...f.at], color = [...f.color];
        at[lane] = r.at;
        color[lane] = m.fill;
        flashes.value = { at, color };
      }
    });
  }, [results, flashes]);

  return (
    <View style={[{ flex: 1, overflow: 'hidden' }, props.style]} onLayout={onLayout} testID={props.testID} accessibilityLabel="Note highway">
      {layout && (
        <HighwayRenderer
          layout={layout}
          theme={theme}
          pages={pages}
          markers={markers}
          scroll={scroll}
          pos={pos}
          clock={clock}
          flashes={flashes}
          countInBeatsPerBar={o.countInBars > 0 ? span.bpb : 0}
          laneName={props.laneName ?? (l => DRUM_NAME[l])}
        />
      )}
    </View>
  );
}
