// The highway drawn with React Native views. Static pieces (lanes, grid, notes, count) are plain views inside one
// Animated.View that the UI thread translates every frame; only the now-line flashes, the beat ball and the count-in
// numbers have per-frame animated styles (a handful, whatever the chart's length).
import { memo } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { beatPulse, countInNumber, flashOpacity, type HighwayLayout, type PageScene } from '../geometry';
import type { MarkerGlyph } from '../markers';
import type { PlayTheme } from '../theme';
import type { HighwayRendererProps } from './types';

const FLASH_MS = 450;

/** A box centred on (main, cross) in track coordinates, for either flow. */
function box(layout: HighwayLayout, main: number, cross: number, along: number, across: number): ViewStyle {
  return layout.flow === 'leftward'
    ? { position: 'absolute', left: main - along / 2, top: cross - across / 2, width: along, height: across }
    : { position: 'absolute', left: cross - across / 2, top: main - along / 2, width: across, height: along };
}

/** A line across the lanes at `main`. */
function line(layout: HighwayLayout, main: number, thickness: number): ViewStyle {
  return layout.flow === 'leftward'
    ? { position: 'absolute', left: main - thickness / 2, top: layout.linesFrom, width: thickness, height: layout.linesTo - layout.linesFrom }
    : { position: 'absolute', top: main - thickness / 2, left: layout.linesFrom, height: thickness, width: layout.linesTo - layout.linesFrom };
}

const Page = memo(function Page({ page, layout, theme }: { page: PageScene; layout: HighwayLayout; theme: PlayTheme }) {
  const fontFor = (size: number) => Math.max(10, Math.round(size * 0.45));
  return (
    <>
      {page.grid.map(g => (
        <View key={`g${g.beat}`} pointerEvents="none" style={[line(layout, g.main, g.kind === 'bar' ? 2 : 1), { backgroundColor: g.kind === 'bar' ? theme.barLine : theme.beatLine }]} />
      ))}
      {page.grid.map(g => g.label && (
        <Text
          key={`gl${g.beat}`}
          style={[
            styles.gridLabel,
            { color: theme.gridLabel },
            layout.flow === 'leftward' ? { left: g.main + 8, top: layout.gridLabelCross - 9 } : { left: 8, top: g.main - 20 },
          ]}
        >
          {g.label}
        </Text>
      ))}
      {layout.count && page.counts.map(c => (
        <Text
          key={`c${c.beat}`}
          style={[
            styles.count,
            box(layout, c.main, layout.count!.cross, 40, 32),
            { color: c.countIn ? theme.gridLabel : c.and ? theme.countAnd : theme.countNumber, fontWeight: c.and ? '700' : '800' },
          ]}
        >
          {c.text}
        </Text>
      ))}
      {page.notes.map(n => {
        const width = n.shape === 'square' ? n.size * 1.3 : n.size; // the same look in both flows
        const height = n.shape === 'bar' ? n.size * 0.35 : n.size;
        const radius = n.shape === 'square' ? n.size * 0.26 : n.size / 2;
        const ring = n.shape === 'ring';
        const back = -layout.sign * n.size; // grace strokes sit just before the note in time: left (leftward), below (downward)
        return (
          <View key={`n${n.index}`} pointerEvents="none" style={[box(layout, n.main, n.cross, n.size * 2, n.size * 2), styles.center, { opacity: (n.ghost ? 0.6 : 1) * (n.auto ? 0.3 : 1) }]}>
            {Array.from({ length: n.grace }, (_, k) => (
              <View
                key={k}
                style={[
                  styles.grace,
                  { backgroundColor: n.color, width: n.size * 0.24, height: n.size * 0.24, borderRadius: n.size * 0.12 },
                  layout.flow === 'leftward' ? { transform: [{ translateX: back * (0.55 + 0.3 * k) }] } : { transform: [{ translateY: back * (0.55 + 0.3 * k) }] },
                ]}
              />
            ))}
            <View
              style={[
                styles.center,
                { width, height },
                { borderRadius: radius, backgroundColor: ring ? 'transparent' : n.color },
                ring && { borderWidth: Math.max(3, n.size * 0.14), borderColor: n.color },
                n.accent && !ring && { borderWidth: 3, borderColor: theme.accentRing },
              ]}
            >
              {n.label !== '' && <Text style={[styles.noteText, { color: theme.noteText, fontSize: fontFor(n.size) }]}>{n.label}</Text>}
            </View>
          </View>
        );
      })}
    </>
  );
});

const Markers = memo(function Markers({ markers, layout, theme }: { markers: readonly MarkerGlyph[]; layout: HighwayLayout; theme: PlayTheme }) {
  return (
    <>
      {markers.map(m => (
        <View key={m.key} pointerEvents="none" style={[box(layout, m.main, m.cross, m.width * 2, m.height * 2), styles.center]}>
          <View
            style={[
              styles.center,
              { width: m.width, height: m.height, borderRadius: m.radius, backgroundColor: m.fill, borderColor: m.border, borderWidth: m.dashed ? 3 : 0, borderStyle: m.dashed ? 'dashed' : 'solid' },
            ]}
          >
            <Text style={[styles.noteText, { color: m.glyphColor, fontSize: Math.round(m.height * (m.kind === 'extra' ? 0.7 : 0.5)) }]}>{m.glyph}</Text>
          </View>
          {m.caption !== '' && (
            <Text style={[styles.caption, { color: theme.offsetText, top: m.height * 1.5 + 2 }]} numberOfLines={1}>
              {m.caption}
            </Text>
          )}
        </View>
      ))}
    </>
  );
});

function LaneFlash({ index, cross, layout, flashes, clock }: { index: number; cross: number } & Pick<HighwayRendererProps, 'layout' | 'flashes' | 'clock'>) {
  const size = layout.noteSize * 1.6;
  const style = useAnimatedStyle(() => {
    const f = flashes.value;
    const a = flashOpacity(clock.value - (f.at[index] ?? -Infinity), FLASH_MS);
    return { opacity: a, borderColor: f.color[index] ?? 'transparent', transform: [{ scale: 1 + 0.25 * (1 - a) }] };
  });
  return <Animated.View pointerEvents="none" style={[box(layout, layout.nowAt, cross, size, size), { borderRadius: size / 2, borderWidth: 4 }, style]} />;
}

function BeatBall({ layout, theme, pos }: Pick<HighwayRendererProps, 'layout' | 'theme' | 'pos'>) {
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.35 * beatPulse(pos.value) }] }));
  const d = 22;
  const at: ViewStyle = layout.flow === 'leftward'
    ? { left: layout.nowAt - d / 2, top: layout.linesTo - d / 2 + 2 }
    : { left: 6, top: layout.nowAt - d / 2 };
  return <Animated.View pointerEvents="none" style={[styles.ball, at, { width: d, height: d, borderRadius: d / 2, backgroundColor: theme.nowBall, borderColor: theme.nowBallStroke }, style]} />;
}

function CountInNumber({ n, bpb, pos, color }: { n: number; bpb: number; color: string } & Pick<HighwayRendererProps, 'pos'>) {
  const style = useAnimatedStyle(() => {
    const p = pos.value;
    return { opacity: p < 0 && countInNumber(p, bpb) === n ? 1 : 0 };
  });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
      <Animated.Text style={[styles.countIn, { color }, style]}>{String(n)}</Animated.Text>
    </View>
  );
}

export function ViewHighwayRenderer(p: HighwayRendererProps) {
  const { layout, theme, pages, markers, scroll } = p;
  const content = useAnimatedStyle(() =>
    layout.flow === 'leftward' ? { transform: [{ translateX: scroll.value }] } : { transform: [{ translateY: scroll.value }] },
  );
  const t = layout.track;
  const nowLine: ViewStyle = layout.flow === 'leftward'
    ? { left: layout.nowAt - 2, top: layout.linesFrom - 10, width: 4, height: layout.linesTo - layout.linesFrom + 12, borderRadius: 2 }
    : { top: layout.nowAt - 1.5, left: 0, height: 3, width: t.w };
  const countNums = Array.from({ length: Math.ceil(p.countInBeatsPerBar) }, (_, i) => i + 1);

  return (
    <View style={[styles.root, { width: layout.width, height: layout.height, backgroundColor: theme.background }]}>
      {layout.labels.map(l => (
        <View key={l.id} style={[styles.label, { left: l.x, top: l.y, width: l.w, height: l.h }, layout.flow === 'downward' && styles.labelDown]}>
          {layout.flow === 'leftward' && <View style={[styles.dot, { backgroundColor: theme.drum[l.id] }]} />}
          <Text style={[layout.flow === 'leftward' ? styles.laneName : styles.laneNameDown, { color: theme.laneLabel }]} numberOfLines={1}>
            {p.laneName(l.id)}
          </Text>
        </View>
      ))}
      <View style={[styles.track, { left: t.x, top: t.y, width: t.w, height: t.h }]}>
        {layout.lanes.map((lane, i) => (
          <View
            key={lane.id}
            style={[
              layout.flow === 'leftward'
                ? { position: 'absolute', left: 0, right: 14, top: lane.cross - lane.size / 2 + 3, height: lane.size - 6, borderRadius: 14 }
                : { position: 'absolute', top: 0, bottom: 0, left: lane.cross - lane.size / 2, width: lane.size },
              { backgroundColor: theme.laneFill[i % 2] },
            ]}
          />
        ))}
        {layout.count && (
          <View style={{ position: 'absolute', left: 0, right: 14, top: layout.count.cross - 25, height: 50, borderRadius: 14, backgroundColor: theme.countRowFill }} />
        )}
        <Animated.View style={[styles.content, content]}>
          {pages.map(page => <Page key={page.page} page={page} layout={layout} theme={theme} />)}
          <Markers markers={markers} layout={layout} theme={theme} />
        </Animated.View>
        {layout.lanes.map((lane, i) => (
          <LaneFlash key={lane.id} index={i} cross={lane.cross} layout={layout} flashes={p.flashes} clock={p.clock} />
        ))}
        <View pointerEvents="none" style={[styles.abs, nowLine, { backgroundColor: theme.nowLine }]} />
        {layout.count && <BeatBall layout={layout} theme={theme} pos={p.pos} />}
        {countNums.map(n => <CountInNumber key={n} n={n} bpb={p.countInBeatsPerBar} pos={p.pos} color={theme.countNumber} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative', overflow: 'hidden' },
  abs: { position: 'absolute' },
  track: { position: 'absolute', overflow: 'hidden' },
  content: { position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible' },
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { position: 'absolute', flexDirection: 'row', alignItems: 'center', paddingLeft: 18, gap: 10 },
  labelDown: { paddingLeft: 0, justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  laneName: { fontSize: 20, fontWeight: '700', flexShrink: 1 },
  laneNameDown: { fontSize: 13, fontWeight: '600' },
  gridLabel: { position: 'absolute', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  count: { fontSize: 24, textAlign: 'center', fontVariant: ['tabular-nums'] },
  noteText: { fontWeight: '800', textAlign: 'center', includeFontPadding: false },
  caption: { position: 'absolute', fontSize: 12, fontWeight: '700', width: 80, textAlign: 'center' },
  grace: { position: 'absolute' },
  ball: { position: 'absolute', borderWidth: 2 },
  countIn: { fontSize: 96, fontWeight: '900', textAlign: 'center' },
});
