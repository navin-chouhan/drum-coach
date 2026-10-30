// The highway renderer contract. NoteHighway does the timing, paging and results; a renderer only draws. Today's
// renderer is React Native views + Reanimated (render/views.tsx). A Skia renderer would implement the same props, and
// render/index.ts is the one file that picks it.
import type { DerivedValue, SharedValue } from 'react-native-reanimated';
import type { DrumId } from '../chartLike';
import type { HighwayLayout, PageScene } from '../geometry';
import type { MarkerGlyph } from '../markers';
import type { PlayTheme } from '../theme';

/** Per-lane flash at the now line ("a hit just landed"): Clock ms it started and its colour, in layout.lanes order. */
export type LaneFlashes = { at: number[]; color: string[] };

export type HighwayRendererProps = {
  layout: HighwayLayout;
  theme: PlayTheme;
  /** Mounted pages (a few bars around now). They change once per page, not per frame. */
  pages: readonly PageScene[];
  /** Judged notes and extra strokes. Change once per result, not per frame. */
  markers: readonly MarkerGlyph[];
  /** Translation of the page content along the main axis; updated on the UI thread every frame. */
  scroll: DerivedValue<number>;
  /** Position in beats (negative during the count-in); UI thread, every frame. */
  pos: DerivedValue<number>;
  /** Clock ms of the frame being drawn; UI thread, every frame. */
  clock: SharedValue<number> | DerivedValue<number>;
  flashes: SharedValue<LaneFlashes>;
  /** Beats per bar, for the big count-in numbers; 0 = no count-in overlay. */
  countInBeatsPerBar: number;
  laneName: (lane: DrumId) => string;
};
