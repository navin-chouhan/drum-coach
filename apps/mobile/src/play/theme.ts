// Colours of the play surfaces. Pure data (no React Native), so worklets can capture it and tests can read it.
// IPAD_THEME follows the owner's iPad mockups (docs/mockups/ipad/ipad.css, not yet approved: D4); WEB_THEME keeps the
// web app's pop-art drum colours (src/ui/drums.ts). Every component takes `theme`, so the choice is one prop.
import type { DrumId } from './chartLike';

/** How a judged note came out. 'onIt' = perfect, early/late = good but off, missed, extra = a stroke with no note. */
export type ResultKind = 'onIt' | 'early' | 'late' | 'missed' | 'extra';

export type PlayTheme = {
  name: string;
  drum: Record<DrumId, string>;
  /** Fill of a pad that isn't in this lesson (kit view, touch pads). */
  idle: string;
  idleText: string;
  result: Record<ResultKind, string>;
  /** Text colour for an early/late offset ("+48 ms"). */
  offsetText: string;
  background: string;
  laneFill: readonly [string, string];
  barLine: string;
  beatLine: string;
  laneLabel: string;
  gridLabel: string;
  countNumber: string;
  countAnd: string;
  countRowFill: string;
  nowLine: string;
  nowBall: string;
  nowBallStroke: string;
  noteText: string;
  /** Pad names on lit pads (kit view, touch pads). */
  padText: string;
  accentRing: string;
};

const RESULT_IOS: Record<ResultKind, string> = {
  onIt: '#34C759', // green
  early: '#FF9500', // orange
  late: '#FF9500',
  missed: '#FF3B30', // red, dashed outline
  extra: '#FF3B30', // red ✕
};

export const IPAD_THEME: PlayTheme = {
  name: 'ipad',
  drum: {
    hihat: '#0FA3B1', crash: '#D99A00', snare: '#5856D6', tom1: '#AF52DE',
    tom2: '#C93A9E', floor: '#A2845E', ride: '#00A383', kick: '#48484A',
  },
  idle: '#E3E3E8',
  idleText: 'rgba(60,60,67,0.55)',
  result: RESULT_IOS,
  offsetText: '#C25E00',
  background: '#FFFFFF',
  laneFill: ['#FAFAFC', '#F6F6F9'],
  barLine: 'rgba(60,60,67,0.35)',
  beatLine: 'rgba(60,60,67,0.10)',
  laneLabel: '#1C1C1E',
  gridLabel: 'rgba(60,60,67,0.6)',
  countNumber: '#1C1C1E',
  countAnd: '#007AFF',
  countRowFill: '#F2F2F7',
  nowLine: '#FFCC00',
  nowBall: '#FFCC00',
  nowBallStroke: '#C99A00',
  noteText: '#FFFFFF',
  padText: '#FFFFFF',
  accentRing: '#1C1C1E',
};

/** The web app's colours (src/ui/drums.ts, src/play/Highway.tsx JCOLOR) on the web's dark stage. */
export const WEB_THEME: PlayTheme = {
  name: 'web',
  drum: {
    kick: '#E8423F', crash: '#FF5FA2', ride: '#FF9F1C', hihat: '#FFE14D',
    tom1: '#2F6FE4', tom2: '#8C5CFF', floor: '#7CD957', snare: '#2DE1C2',
  },
  idle: '#3A3A3A',
  idleText: '#9A9A9A',
  result: { onIt: '#4BE08A', early: '#FFE14D', late: '#FFE14D', missed: '#FF5A4F', extra: '#FF5A4F' },
  offsetText: '#FFE14D',
  background: '#141414',
  laneFill: ['rgba(255,255,255,0.025)', 'rgba(255,255,255,0)'],
  barLine: 'rgba(255,225,77,0.35)',
  beatLine: 'rgba(255,255,255,0.08)',
  laneLabel: '#E6E6E6',
  gridLabel: '#9A9A9A',
  countNumber: '#FFFFFF',
  countAnd: '#FFE14D',
  countRowFill: 'rgba(255,255,255,0.05)',
  nowLine: 'rgba(255,225,77,0.9)',
  nowBall: '#FFE14D',
  nowBallStroke: '#141414',
  noteText: '#141414',
  padText: '#141414',
  accentRing: '#FFFFFF',
};

export const THEMES = { ipad: IPAD_THEME, web: WEB_THEME } as const;
