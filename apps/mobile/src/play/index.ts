// Play surfaces (A6 part 1): screen-independent components for the lesson player. A7 places them in the approved
// screens. Pure helpers (geometry, kit layout, touch, results) are exported for the take adapter and tests.
export { NoteHighway, type NoteHighwayProps } from './NoteHighway';
export { KitView, type KitViewProps } from './KitView';
export { TouchPads, type TouchPadsProps } from './TouchPads';
export { useUiClock, type UiClockOptions } from './useUiClock';
export { createStream, resultKind, type PadHit, type PlayResult, type Judgement, type Subscribe } from './events';
export { IPAD_THEME, WEB_THEME, THEMES, type PlayTheme, type ResultKind } from './theme';
export { KIT_LANES, NOTATION_LANES, LEFTWARD_DEFAULTS, DOWNWARD_DEFAULTS, type Flow, type HighwayOptions } from './geometry';
export { MINI_KIT, TOUCH_KIT, type KitLayout } from './kitLayout';
export type { HiHatMode, VelocityMode } from './touch';
export type { ChartLike, ChartNoteLike, ChartDrum, DrumId, PadId } from './chartLike';
