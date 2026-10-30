// The lesson player's view of a take, and the port it drives the take engine through.
//
// The shapes are the web's (src/play/player.ts PlayOptions, Finished, player state), so the lesson logic ports
// unchanged. The take engine itself is core's createTake (A4p2, AUDIO-DESIGN §2.3); `TakePort` is the adapter the
// screens use, so the lesson logic never depends on the engine's exact signature (bindings: ./takePort.ts).
import type { BandSpec } from '@drum-coach/core/engine/band';
import type { Chart, ChartDrum } from '@drum-coach/core/engine/chart';
import type { Cue } from '@drum-coach/core/engine/liveCoach';
import type { Run, RunOptions } from '@drum-coach/core/engine/run';
import type { Judgement, NoteResult, PlayedHit, RunStats } from '@drum-coach/core/engine/scoring';

/** What a lesson take asks for: the web's PlayOptions without the web-only parts (AudioBuffer backing, YouTube clock). */
export type PlayOptions = RunOptions & {
  speed: number;
  metronome: boolean;
  subdivision: 1 | 2 | 4;
  countInBars: number;
  wait: boolean;
  activeLanes?: ChartDrum[];
  demo?: boolean;
  guide?: boolean;
  gapBars?: number;
  hints?: boolean;
  countAloud?: string[][];
  freeBars?: number[];
  seconds?: number;
  probe?: boolean;
  endless?: boolean;
  fadeClick?: number;
  clickOn?: 'quarters' | '8ths' | '2and4';
  /** A demo that plays to its end runs this next (not when stopped or replaced). */
  then?: () => void;
  oneOff?: boolean;
  zoom?: number;
  goodMs?: number;
  count?: boolean;
  band?: BandSpec;
  feelTarget?: { ms: number; tol: number };
  swingWant?: [number, number];
  lesson?: { id: string; step: number; title: string; goal: string; tool?: string; bite?: { songId: string; fromBar: number; toBar: number } };
};

/**
 * A finished take (the web's Finished). `interrupted` (D6, AUDIO-DESIGN §4): a call, Siri or the app going to the
 * background ended it at its last whole bar; it is kept only with ≥ 2 whole bars and never counts for the ladder.
 */
export type Finished = {
  cues: Cue[]; zero: number; chart: Chart; run: Run; options: PlayOptions;
  results: NoteResult[]; extras: PlayedHit[]; hits: PlayedHit[]; stats: RunStats;
  startedAt: string; durationS: number;
  interrupted?: { reason?: string };
};

export type Feedback = { lane: string; judgement: Judgement | 'extra'; time: number };

/** The live state a view reads (the web's `player`). Times are Clock ms. */
export type TakeState = {
  phase: 'idle' | 'playing' | 'done';
  chart?: Chart; run?: Run; options?: PlayOptions;
  zero: number; beatMs: number;
  results: NoteResult[]; feedback: Feedback[]; auto: boolean[]; extraBeats: number[];
  cue?: { cue: Cue; at: number };
  finished?: Finished;
};

/** The take engine as the lesson player uses it (the web's player.ts module API, one instance per screen). */
export interface TakePort {
  readonly state: TakeState;
  /** Starts a take (dropping any running one). Count-in, clicks, app-played notes and the band are the engine's. */
  start(chart: Chart, options: PlayOptions): void;
  /** Stop: an endless take keeps its whole bars; 'interrupted' ends any take at its last whole bar (D6). */
  stop(reason?: 'user' | 'interrupted'): void;
  /** Run position in beats at Clock time `now` (negative in the count-in). */
  position(now?: number): number;
  /** Called on every phase change and when a take finishes (state.finished is then set). */
  subscribe(fn: () => void): () => void;
}
