// The one place Practice reaches the take engine (A4p2's createTake in @drum-coach/core/play/take, driven by the
// lesson player's adapter, A7b). Until both are in this build, playing a take or hearing an exercise says so on the
// screen instead of failing; the metronome-only mode already plays (it needs only the AudioPort).
import type { PracticeChart } from './catalog';
import type { PracticeOptions, Section } from './play';

export type TakeRequest = {
  chart: PracticeChart;
  options: PracticeOptions;
  section: Section;
  /** A demo: the app plays the exercise (Hear it). */
  demo?: boolean;
  /** Times round, for the warm-up (about a minute). */
  repeats?: number;
};

export type PracticeEngine = {
  /** False until the take engine is in this build. */
  readonly ready: boolean;
  /** Why it isn't, in the screen's words. */
  readonly notReady: string;
  start(req: TakeRequest): boolean;
  stop(): void;
};

export const practiceEngine: PracticeEngine = {
  ready: false,
  notReady: 'Takes start here once the player is in this build (it is on its way). The metronome already works.',
  start: () => false,
  stop: () => {},
};
