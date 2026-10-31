// The lesson chart as drum notation with a moving cursor and results on the notes: the iPad's "Sheet" view, the
// default in the lesson player (D8), with NoteHighway as the alternative. Same props as NoteHighway, so the player
// swaps the two by changing one component.
//
// The notation is the web's (VexFlow) drawn inside an Expo DOM component (dom/SheetDom.tsx, a WebView). What crosses
// the bridge: the chart, tempo and beat-0 time as props (once per take), the Clock on request (a few round trips every
// 2 s, to map the WebView's own performance.now() onto the Clock), and each result as it's judged. The cursor moves on
// the WebView's requestAnimationFrame: no message per frame.
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { ChartLike } from '../play/chartLike';
import type { PlayResult, Subscribe } from '../play/events';
import { IPAD_THEME, type PlayTheme } from '../play/theme';
import SheetDom, { type SheetHandle } from './dom/SheetDom';
import { createResultLog, sheetColors, type ResultBatch, type SheetChart } from './sheetModel';

export type NotationViewProps = {
  chart: ChartLike;
  /** The take's tempo (the chart's bpm × speed). */
  bpm: number;
  /** Clock ms when beat 0 is heard (the end of the count-in). A new value starts a new take (marks cleared). */
  zero: number;
  /** The app's Clock (iOS: MidiPort.clock.now; tests and the dev screen: any monotonic ms). */
  now: () => number;
  /** Input latency (ms) the take engine removes from strokes; extra strokes are drawn where they were meant. */
  latencyMs: number;
  /** Judged notes and extra strokes from the take engine (the same stream NoteHighway takes). */
  results?: Subscribe<PlayResult>;
  theme?: PlayTheme;
  /** The count and who plays each note (R / L hand, K kick, H hi-hat foot) under the staff. Default true. */
  hints?: boolean;
  /** A left-handed player: R and L swapped in the hints (the web's leftHanded setting). */
  leftHanded?: boolean;
  /** Notation zoom (1 = VexFlow size). Default: 1.6 on the iPad, 1.1 under 700 pt wide. */
  scale?: number;
  /** How far ahead of requestAnimationFrame a frame is shown (ms). Default 0. */
  displayLeadMs?: number;
  /**
   * Show this page (0-based) of the chart, with no cursor: a finished take paged through (the results sheet). Leave it
   * out to follow the take on the Clock.
   */
  page?: number;
  /** How many pages the chart takes at the view's size (called on every layout). */
  onPages?: (pages: number) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type PushTarget = { push?: (batch: ResultBatch) => void };

export function NotationView(props: NotationViewProps) {
  const { chart, bpm, zero, now, latencyMs, results, theme = IPAD_THEME, hints = true, leftHanded = false } = props;
  const sheetChart = useMemo<SheetChart>(
    () => ({ notes: [...chart.notes], timeSignature: [chart.timeSignature[0], chart.timeSignature[1]], bars: chart.bars, ...(chart.title !== undefined && { title: chart.title }) }),
    [chart],
  );
  const colors = useMemo(() => sheetColors(theme), [theme]);
  const handle = useRef<SheetHandle>(null);

  // The take's results, kept for a WebView that loads (or reloads) mid-take.
  const log = useMemo(() => createResultLog(), []);
  useEffect(() => log.reset(zero), [log, zero, chart]);
  useEffect(() => {
    if (!results) return;
    return results(r => {
      const batch = log.add(r);
      // The handle's methods exist once the WebView has registered them; until then `ready` replays the log.
      const target = handle.current as PushTarget | null;
      if (typeof target?.push === 'function') target.push(batch);
    });
  }, [results, log]);

  const nowRef = useRef(now);
  nowRef.current = now;
  const clockNow = useCallback(async () => nowRef.current(), []);
  const ready = useCallback(async (take: number) => log.since(take), [log]);
  const pagesRef = useRef(props.onPages);
  pagesRef.current = props.onPages;
  const onPages = useCallback(async (n: number) => { pagesRef.current?.(n); }, []);

  return (
    <View
      style={[{ flex: 1, overflow: 'hidden', backgroundColor: colors.paper }, props.style]}
      pointerEvents="none"
      testID={props.testID}
      accessibilityRole="image"
      accessibilityLabel={`Drum notation${chart.title ? ` for ${chart.title}` : ''}`}
    >
      <SheetDom
        ref={handle}
        chart={sheetChart}
        bpm={bpm}
        zero={zero}
        latencyMs={latencyMs}
        colors={colors}
        hints={hints}
        leftHanded={leftHanded}
        scale={props.scale}
        displayLeadMs={props.displayLeadMs ?? 0}
        clockNow={clockNow}
        ready={ready}
        page={props.page}
        onPages={onPages}
        dom={{ style: { flex: 1 }, scrollEnabled: false, bounces: false, overScrollMode: 'never' }}
      />
    </View>
  );
}
