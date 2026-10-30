// CONTRACT DRAFT — review with A4
//
// The take engine's interface (B21): one clock-agnostic take for web and iOS, so both score the same way. Types and
// doc comments only; A4 implements `createTake` in Phase 2 from src/play/player.ts (start / startExternal / finish /
// position / waitGroups / liveCheck), and the web's player.ts then becomes a thin adapter over Web Audio.
//
// The rules it keeps (docs/mobile/RECON.md §3):
// - Every time in and out is host ms on the one Clock (platform.ts): hit times, beat 0, schedule times, latency.
//   The core never sees audio-clock seconds; the AudioPort maps Clock ms to its own clock.
// - Scoring only subtracts times from one Clock, so a take with every time shifted by 1e9 ms scores the same.
// - The core may use setTimeout for its lookahead loop (the web used setInterval every 25 ms, scheduling 200 ms ahead
//   and dropping what's more than 30 ms late); no requestAnimationFrame, no performance.now().
import type { Clock } from '../platform.ts';
import type { BandNote, BandSpec } from '../engine/band.ts';
import type { Chart, ChartDrum } from '../engine/chart.ts';
import type { PadId } from '../engine/kit.ts';
import type { Chattiness, Cue } from '../engine/liveCoach.ts';
import type { Run, RunOptions } from '../engine/run.ts';
import type { Judgement, NoteResult, PlayedHit, RunStats } from '../engine/scoring.ts';
import type { Hit } from '../input/hits.ts';

/**
 * Sound out, scheduled on the Clock. Web: Web Audio through audioToPerf's inverse (src/play/audio.ts). iOS: the
 * native host-time click scheduler (S1/A4). A port may drop a sound whose time has already passed.
 */
export interface AudioPort {
  /** One metronome click at Clock time `at` (host ms). level 0 = bar start, 1 = beat, 2 = subdivision; volume 0–1. */
  click(at: number, level: 0 | 1 | 2, volume: number): void;
  /** An app-played drum note (layered practice, guide, demo) at `at`; velocity 1–127. */
  drum?(pad: PadId, velocity: number, at: number): void;
  /** A backing-band note (engine/band.ts) at `at`, lasting `durMs`. */
  band?(note: BandNote, at: number, durMs: number): void;
  /** A spoken count-in or count-aloud word at `at`; returns false when the word isn't ready (it's skipped). */
  say?(word: string, at: number): boolean;
  /** Stop everything this take scheduled that hasn't sounded yet (Stop, a new take). */
  cancelAll(): void;
  /**
   * Output latency in ms: how long after its scheduled Clock time a sound really leaves the speaker, as far as the
   * platform knows (web: baseLatency + outputLatency). The student's own measured `latencyMs` is separate (TakeOptions).
   */
  outputLatencyMs(): number;
  /**
   * Optional drift: where a sound scheduled at Clock time `at` will actually play, minus `at` (ms). The take smooths
   * it (×0.1 per tick, ignoring jumps over 50 ms) and subtracts it from hit times, as player.ts does with audioToPerf.
   */
  drift?(at: number): number;
}

/** What a take needs from the app. */
export type TakeDeps = {
  clock: Clock;
  audio: AudioPort;
  /** The hit bus (input/hits.ts createHitBus): the take listens while it runs and unsubscribes when it ends. */
  hits: { onHit(fn: (h: Hit) => void): () => void };
  /** Live tips (engine/liveCoach.ts); off when undefined, or for wait mode, demos and guided takes. */
  liveTips?: { chattiness: Chattiness; wording?: (cue: Cue) => Cue };
};

/** A song clock someone else owns (a YouTube video): run beats at a Clock time. Scoring then uses beats × beatMs. */
export type ExternalClock = { position(hostMs: number): number; begin(): void; end(): void };

/** One take. Mirrors player.ts PlayOptions, minus the web-only parts (AudioBuffer backing, lesson metadata). */
export type TakeOptions = RunOptions & {
  chart: Chart;
  /** The tempo played, BPM (chart.bpm × speed). */
  bpm: number;
  /**
   * Beat 0 of the run on the Clock (host ms), after the count-in. Default: clock.now() + 150 ms lead-in +
   * countInBars of beats (player.ts: t0 = currentTime + 0.15). Ignored with `external` (beat 0 is the song's).
   */
  zero?: number;
  countInBars: number;
  /** The student's measured latency (sound out → stroke heard), ms; subtracted from every hit time. Per device. */
  latencyMs: number;
  /** Wait mode: the run advances to each group of notes and waits there until it's played; no clock, no click. */
  wait: boolean;
  metronome: boolean;
  subdivision: 1 | 2 | 4;
  clickOn?: 'quarters' | '8ths' | '2and4';
  gapBars?: number;            // the click is silent on every n-th bar
  fadeClick?: number;          // the click fades to silence over this many bars
  countIn?: boolean;           // speak the count-in (AudioPort.say)
  countAloud?: string[][];     // words per bar, one per slot ('' = silent): engine/lesson.ts countPlan
  activeLanes?: ChartDrum[];   // lanes the student plays; the app plays the rest
  demo?: boolean;              // the app plays every note and nothing is scored
  guide?: boolean;             // the app plays every note softly under you; still scored
  freeBars?: number[];         // 1-based chart bars that are yours: strokes there aren't extras
  seconds?: number;            // an endless take that ends by itself after this long
  endless?: boolean;           // loops until stop(), which keeps the whole bars played
  goodMs?: number;             // a wider Good window (engine/lesson.ts goodMsFor)
  band?: BandSpec;
  feelTarget?: { ms: number; tol: number };
  swingWant?: [number, number];
  external?: ExternalClock;
};

/** Live state a view reads every frame (the highway, the sheet), like player.ts `player`. */
export type TakeView = {
  phase: 'idle' | 'playing' | 'done';
  zero: number; beatMs: number;
  results: NoteResult[];
  feedback: { lane: string; judgement: Judgement | 'extra'; time: number }[];
  auto: boolean[];
  extraBeats: number[];
  cue?: { cue: Cue; at: number };
};

/** The finished take, as player.ts `Finished` (startedAt and durationS are wall-clock; the app may fill them). */
export type TakeResult = {
  cues: Cue[]; zero: number; chart: Chart; run: Run; options: TakeOptions;
  results: NoteResult[]; extras: PlayedHit[]; hits: PlayedHit[]; stats: RunStats;
  startedAt: string; durationS: number;
};

export type Take = {
  /** Schedules the count-in and starts listening for hits. */
  start(): void;
  /** Stops. An endless take finishes with the whole bars played (onResult fires); any other take is dropped. */
  stop(): void;
  /** Called once when the take finishes (not for demos or dropped takes). */
  onResult(fn: (r: TakeResult) => void): () => void;
  /** Called with every live tip as it's given. */
  onCue?(fn: (c: Cue) => void): () => void;
  /** Run position in beats at a Clock time (negative during the count-in; wait mode advances by elapsed time). */
  position(now?: number): number;
  readonly view: TakeView;
};

/** A4 implements `export const createTake: CreateTake` in this file. */
export type CreateTake = (deps: TakeDeps, opts: TakeOptions) => Take;
