import type { AudioInterruption, AudioRoute } from '@drum-coach/core/play/audioPort';
import type { Bus } from './policy';

/** The route as native reports it: exactly `AudioRoute` (contract.test.ts checks it), plus the raw port fields. */
export type NativeRoute = AudioRoute & { portType: string; uid: string };

export type PreparedWords = {
  /** Words ready to schedule: their normalised text (wordKey), native sound index and onset (ms into the buffer). */
  ready: { word: string; index: number; onsetMs: number }[];
  /** Words that couldn't be rendered (no voice, timeout). */
  missing: string[];
};

export type ScheduleResult = {
  /** Kept for playing. */
  accepted: number;
  /** Already too late to play exactly: dropped (isLate). */
  late: number;
  /** Past the queue cap. */
  dropped: number;
  /** Malformed records (unpackEvents). */
  invalid: number;
};

export type NativeStats = { scheduled: number; late: number; dropped: number; engineStarts: number; lastError?: string };

export type TimingProbeResult = {
  /** Host ms of each click onset found in the main mixer's output (installTap buffer AVAudioTime + frame offset). */
  onsetsMs: number[];
  /** Schedule host ms of each click handed to a player node while the probe ran. */
  scheduledMs: number[];
  sampleRate: number;
  tapBuffers: number;
  /** Tap buffers without a valid host time (their onsets are skipped). */
  noHostTime: number;
};

/** backingLoad: the file as native opened it. */
export type BackingLoadResult = { durationMs: number; sampleRate: number; frames: number; channels: number };

/** backingStart: the plan (src/backing.ts planBackingStart) or why nothing plays. */
export type BackingStartResult =
  | {
      ok: true; rate: number; startFrame: number; fileStartMs: number; heardAtMs: number; scheduleMs: number;
      joinedLateMs: number; pitchLatencyMs: number;
      /** Started as a node sample time (rate ≠ 1) instead of a host time. */
      nodeTime: boolean;
    }
  | { ok: false; reason: string };

/** backingQueue: the queued segment (src/backing.ts planBackingQueue) or why nothing was queued. */
export type BackingQueueResult =
  | {
      ok: true; playerFrame: number; startFrame: number; frameCount: number; fileStartMs: number; heardAtMs: number;
      skippedFrames: number;
      /** Scheduled at an explicit player time (a gap before it) instead of right after the previous segment. */
      explicitTime: boolean;
      /** Segments on the player's timeline now, this one included. */
      segments: number;
    }
  | { ok: false; reason: string };

/** backingAnchor: the file position heard at Clock time `at`, from the render clock. */
export type NativeBackingAnchor = { playing: true; at: number; fileMs: number } | { playing: false };

export type DrumAudioEvents = {
  onRoute: (route: NativeRoute) => void;
  onInterruption: (e: AudioInterruption) => void;
};

export type BusVolumes = Partial<Record<Bus, number>>;

/** The native surface (ios/DrumAudioModule.swift). Sync calls are JSI `Function`s; start/prepareWords are async. */
export interface DrumAudioApi {
  nowMs(): number;
  start(): Promise<NativeRoute>;
  suspend(): void;
  route(): NativeRoute | null;
  prepareWords(words: string[]): Promise<PreparedWords>;
  schedule(packed: number[]): ScheduleResult;
  cancel(fromMs: number | null): void;
  playNow(index: number, gain: number): number;
  setBusVolumes(volumes: BusVolumes): void;
  stats(): NativeStats;
  debugInfo(): Record<string, unknown>;
  startTimingProbe(): boolean;
  stopTimingProbe(): TimingProbeResult;
  backingLoad(uri: string): Promise<BackingLoadResult>;
  /** `durationMs`: ms of the line to play; NaN = to the file's end. */
  backingStart(at: number, offsetMs: number, rate: number, durationMs: number): BackingStartResult;
  /** Queues a segment behind the last one on the same line (src/backing.ts planBackingQueue). */
  backingQueue(at: number, offsetMs: number, durationMs: number): BackingQueueResult;
  backingStop(): void;
  backingAnchor(): NativeBackingAnchor;
  backingTestTone(bpm: number, beatsPerBar: number, seconds: number): Promise<string>;
  addListener<E extends keyof DrumAudioEvents>(event: E, listener: DrumAudioEvents[E]): { remove(): void };
}
