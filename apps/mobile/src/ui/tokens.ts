// The look of every screen: the web app's tokens (src/ui/styles.css) as the approved iPad mockups use them
// (docs/mockups/ipad/ipad.css, D4 "web look, iPad layout"). Pure data, no React Native, so tests and worklets can read it.
// 1 CSS px in the mockups = 1 pt here.
import type { DrumId, PadId } from '@drum-coach/core/engine/kit';

export const color = {
  /** The hot-pink ground (with white dots, Screen). */
  ground: '#FF5FA2',
  /** Ink: every outline, the sidebar, labels' background, hard shadows. */
  ink: '#141414',
  panel: '#FFFFFF',
  /** Cream panels and stat tiles (--panel2). */
  cream: '#FFF6CC',
  muted: '#4A4A4A',
  faint: 'rgba(20,20,20,0.35)',
  separator: 'rgba(20,20,20,0.12)',
  /** The main move and links (--accent). */
  blue: '#2F6FE4',
  blueSoft: '#DCE7FF',
  /** Pop yellow: selected tabs, labels' text, the lesson panel, the current trail stop (--pop). */
  pop: '#FFE14D',
  /** The mascot and the stage-song ring (--cyan). */
  teal: '#2DE1C2',
  night: '#141414',
  nightText: '#FFFFFF',
  white: '#FFFFFF',
  /** Done / on it (--good), and its soft fill. */
  good: '#1E9E5A',
  goodSoft: '#E3F5EA',
  ok: '#C77700',
  orange: '#FF9F1C',
  orangeSoft: '#FFE9C2',
  bad: '#E8423F',
  badSoft: '#FFE3E2',
  /** Stars: gold with an ink edge; unearned stars are grey. */
  star: '#FFC400',
  starOff: '#D6D6D6',
  toggleOff: '#DADADA',
} as const;

/**
 * One colour per drum: the web kit's colours, moved off green, orange and red (which mean on it / early-late / missed).
 * From the approved mockups (ipad.css --hihat … --kick). The play surfaces' theme (src/play/theme.ts, A6) should carry
 * the same values; until then this is the source for chips, dots and previews.
 */
export const drumColor: Record<DrumId, string> = {
  hihat: '#FFE14D', crash: '#FF5FA2', ride: '#7FD3FF', snare: '#2DE1C2',
  tom1: '#2F6FE4', tom2: '#8C5CFF', floor: '#9C6B4A', kick: '#FFFFFF',
};

/** A pad's colour: its drum's (the hi-hat's three pads share the hi-hat's yellow). */
export const padColor = (pad: PadId): string =>
  pad === 'hhClosed' || pad === 'hhOpen' || pad === 'hhPedal' ? drumColor.hihat : drumColor[pad];

/** How a judged note came out (the mockups' results, on light panels). */
export const resultColor = { onIt: '#1E9E5A', early: '#E07B00', late: '#E07B00', missed: '#E8423F', extra: '#E8423F' } as const;

/** Display type: the iOS system face at its heaviest weight (SF Pro Black) stands in for Arial Black / Archivo Black. */
export const font = {
  display: { fontWeight: '900' },
  heavy: { fontWeight: '800' },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
} as const;

/** The type scale, in pt, as the mockups size things for reading from the throne. */
export const type = {
  title: 28, // screen title (Journey)
  hero: 32, // the lesson's name on the big panel
  bigMove: 30, // the main move
  move: 21, // other moves
  coach: 18, // the coach's line in the title bar (20–23 on the player)
  rank: 19,
  stat: 23,
  body: 15,
  small: 13,
  label: 11.5, // the yellow-on-black section labels
  chip: 13.5,
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 } as const;

/** Outline widths: cards and moves 3, chips and list ticks 2. */
export const stroke = { card: 3, thin: 2 } as const;

/** Hard offset shadows (no blur): cards 5, the big lesson card 6, buttons and the mascot 3, the title 4. */
export const shadow = { card: 5, big: 6, button: 3, title: 4 } as const;

/** Every touch target is at least this tall/wide (pt). */
export const TOUCH_MIN = 44;

/** The iPad frame the mockups draw (landscape, pt). Layouts are width-based; these are the reference numbers. */
export const FRAME = { width: 1194, height: 834, sidebar: 228, sidebarShadow: 6, contentLeft: 260, contentRight: 24 } as const;

/** A hard offset shadow as a React Native `boxShadow` string. */
export const hardShadow = (offset: number, c: string = color.ink): string => `${offset}px ${offset}px 0px 0px ${c}`;
