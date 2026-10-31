// The UI kit (A7a): the approved mockups' look (docs/mockups/ipad/, D4 "web look, iPad layout") as components.
// Screens import from here only. Tokens and pure helpers are tested in Vitest; components are checked on the iPad.
export * from './tokens';
export { Display, Body, Strong, tabular, MAX_FONT_SCALE } from './Text';
export { Screen, DottedGround, type ScreenProps } from './Screen';
export { Card, Panel, Label, pressedBy, toneBg, toneInk, type CardProps, type Tone } from './Card';
export {
  Button, Pill, GestureChip, BigMove, Toggle, Segmented, slopFor,
  type ButtonProps, type ButtonTone, type BigMoveProps, type SegmentOption,
} from './controls';
export { CoachLine, Mascot, type CoachLineProps } from './CoachLine';
export { StatTile, Ring, Stars, Tick, ListRow, CardTitle, type RingProps, type ListRowProps } from './stats';
export { Trail, type TrailStop } from './Trail';
export { Sidebar, DevRow, type SidebarItem, type SidebarProps } from './Sidebar';
export { TitleBar, ComingNext } from './TitleBar';
export { gestureLabel, gestureSpoken, gesturesFor, type Gesture } from './gestures';
export { ringAngles, ratio, trailGeometry, type TrailGeometry } from './layout';
export { statusRows, type StatusRow, type StatusInput, type Dot } from './status';
export { readSettings, writeSettings, subscribeSettings, settingsVersion, SETTINGS_KEY } from './appSettings';
export { createKitMoveRouter, type KitMoveHandlers, type KitMoveRouter } from './kitMoves';
export { getAppHitBus, startAppKeyboard, useAppKey, useAppSettings, useKitMoves, useStatusRows, kitName } from './hooks';
export { NAV, type NavKey } from './nav';
// Promoted from the screens' local pieces (I2): one API each.
export { Group, GroupHead, GroupRow, Chevron, Stepper, ToolFrame, type SymTone, type StepperProps } from './groups';
export { Field, CheckRow, Choice, Small, Warn, Tabs, type FieldProps, type ChoiceOption, type TabItem } from './forms';
export { Notice, Bars, Track, Dots, type Bar } from './charts';
export { StepPills, TempoLadder, TimingLineView, type StepPill, type LadderRung, type TimingLine } from './lessonBits';
export { PadMap, spotOfPart, type PadSpot, type PadSpotState } from './PadMap';
export { SpeechBubble, OfflineCard, KeepsWorkingCard, HostText } from './coachBits';
export { stepValue, stepBounds, digitsOnly, barHeight, percent, dotPositions, rungLooks, splitHost, type RungLook } from './kitMath';
