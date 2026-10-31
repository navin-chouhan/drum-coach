// The lesson player's view of a take, and the port it drives the take engine through. A take is core's
// (@drum-coach/core/play/take, A4p2: the web's player.ts, clock-agnostic); the shapes are the web's PlayOptions,
// Finished and player state, so the lesson logic ports unchanged. Bindings: ./takePort.ts.
import type { Chart } from '@drum-coach/core/engine/chart';
import type { Finished as CoreFinished, TakeOptions, TakeState as CoreTakeState } from '@drum-coach/core/play/take';
import type { PlayResult, Subscribe } from '../../play/events';

/** What a lesson take asks for: core's TakeOptions plus the web PlayOptions' lesson parts (kept with the run). */
export type PlayOptions = TakeOptions & {
  /** The sheet shows the count and who plays each note. */
  hints?: boolean;
  /** One bar of find-your-tempo. */
  probe?: boolean;
  /** A "fix this bar" loop: practice only, no tempo ladder. */
  zoom?: number;
  /** A take the coach asked for in another tool: for fun, no tempo ladder. */
  oneOff?: boolean;
  /** Big "1 & 2 &" on the highway, for the counting lessons. */
  count?: boolean;
  /** A demo that plays to its end runs this next (not when stopped or replaced). */
  then?: () => void;
  lesson?: { id: string; step: number; title: string; goal: string; tool?: string; bite?: { songId: string; fromBar: number; toBar: number } };
};

/**
 * A finished take (core Finished). `interrupted` (D6, AUDIO-DESIGN §4): a call, Siri or the app going to the
 * background ended it at its last whole bar; core keeps it only with ≥ 2 whole bars, and it never counts for the ladder.
 */
export type Finished = CoreFinished<PlayOptions>;

/** The live state a view reads (core's take state; idle before the first take). */
export type TakeState = Pick<CoreTakeState<PlayOptions>, 'zero' | 'beatMs' | 'results' | 'feedback' | 'auto' | 'extraBeats' | 'cue' | 'finished'> & {
  phase: 'idle' | 'playing' | 'done';
  chart?: Chart; run?: CoreTakeState['run']; options?: PlayOptions;
};

/** The take engine as the lesson player uses it (the web's player.ts module API, one instance per screen). */
export interface TakePort {
  readonly state: TakeState;
  /** Starts a take (dropping any running one). Count-in, clicks, app-played notes and the band are the engine's. */
  start(chart: Chart, options: PlayOptions): void;
  /** Stop: an endless take keeps its whole bars; 'interrupted' ends any take at its last whole bar (D6). */
  stop(reason?: 'user' | 'interrupted', at?: number): void;
  /** Run position in beats at Clock time `now` (negative in the count-in). */
  position(now?: number): number;
  /** Called on every phase change and when a take finishes (state.finished is then set). */
  subscribe(fn: () => void): () => void;
  /**
   * Judged notes (index = run note index, as the take's run chart lists them), extra strokes, and misses once a note's
   * window has passed: the stream the highway, the sheet and the kit view listen to.
   */
  results: Subscribe<PlayResult>;
  /** How the last take ended: 'dropped' when an interruption ended it before 2 whole bars (D6). */
  readonly lastEnd?: 'end' | 'user' | 'interrupted' | 'dropped';
}
