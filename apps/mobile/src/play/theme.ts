// Colours of the play surfaces. Pure data (no React Native), so worklets can capture it and tests can read it.
// IPAD_THEME is the approved iPad look (docs/mockups/ipad: the web's black music panel with the approved drum
// colours) and reads every colour it shares with the screens from src/ui/tokens.ts, the one source; WEB_THEME keeps
// the web app's pop-art drum colours (src/ui/drums.ts) as the alternative. Every component takes `theme`.
import { color, drumColor, resultColor, resultOnNight } from '../ui/tokens';
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
  /** The result colours on the sheet music's paper (NotationView). */
  sheetResult: Record<ResultKind, string>;
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

const WHITE = (alpha: number) => `rgba(255,255,255,${alpha})`;

/** The approved iPad look (mockups mock.js `highway`, `kit`): drum colours and results from the UI tokens. */
export const IPAD_THEME: PlayTheme = {
  name: 'ipad',
  drum: { ...drumColor },
  idle: '#3A3A3A',
  idleText: '#9A9A9A',
  result: { ...resultOnNight },
  sheetResult: { ...resultColor },
  offsetText: resultOnNight.early,
  background: color.night,
  laneFill: [WHITE(0.09), WHITE(0.05)],
  barLine: WHITE(0.53),
  beatLine: WHITE(0.13),
  laneLabel: color.white,
  gridLabel: color.pop,
  countNumber: color.white,
  countAnd: '#8FB4FF',
  countRowFill: WHITE(0.07),
  nowLine: color.pop,
  nowBall: color.pop,
  nowBallStroke: color.ink,
  // Drum colours are light (the kick is white): ink on them, as the mockups' gems.
  noteText: color.ink,
  padText: color.ink,
  accentRing: color.white,
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
  // The web sheet's tones (its yellow "good" can't be read on paper).
  sheetResult: { onIt: '#1E9E5A', early: '#C77700', late: '#C77700', missed: '#E8423F', extra: '#E8423F' },
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
