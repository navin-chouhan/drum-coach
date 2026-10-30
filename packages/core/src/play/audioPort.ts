// AudioPort: the contract between core's take engine (createTake/planEvents, Phase 2) and each platform's audio
// (iOS: apps/mobile/src/platform/audio.ts on the drum-audio module; web: an AudioContext adapter).
// Owned by the orchestrator: change only through docs/mobile/BOARD.md. Design and reasons: docs/mobile/AUDIO-DESIGN.md §2.
import type { Clock } from '../platform.ts';
import type { PadId } from '../engine/kit.ts';

/** Sounds native has ready: synth clicks, drum one-shots (8 velocity layers), prepared words. */
export type SoundId =
  | 'click.bar' | 'click.beat' | 'click.sub'
  | `drum.${PadId}`
  | `word.${string}`;

/** Every `at` is the time the sound is HEARD, in Clock ms (iOS: mach host ms; web: performance.now()). */
export type AudioEvent =
  | { kind: 'sound'; at: number; sound: SoundId; gain: number }            // gain 0..1.5; native quantises
  | { kind: 'band'; at: number; part: 'bass' | 'keys'; midi: number[]; durMs: number; vel: number };

export type AudioRoute = {
  /** Stable per output: portType + uid (e.g. "Speaker", "BluetoothA2DPOutput:AA:BB:…"). Keys the stored latency. */
  key: string;
  kind: 'speaker' | 'wired' | 'usb' | 'bluetooth' | 'airplay' | 'other';
  name: string;
  outputLatencyMs: number;   // AVAudioSession.outputLatency × 1000 (web: baseLatency + outputLatency)
  ioBufferMs: number;        // AVAudioSession.ioBufferDuration × 1000
  sampleRate: number;
  /** Schedule time + heardOffsetMs = heard time. M5 decides: outputLatencyMs (branch A) or 0 (branch B). §5. */
  heardOffsetMs: number;
  /** Hand events over at least this long before they're heard (ioBufferMs + heardOffsetMs + 10). */
  minLeadMs: number;
};

export type AudioInterruption =
  | { type: 'began'; at: number; reason?: string }                 // call, Siri, alarm… (raw iOS reason when given)
  | { type: 'ended'; at: number; shouldResume: boolean }
  | { type: 'engine-stopped'; at: number; cause: 'config-change' | 'media-reset' | 'background' };

export interface BackingPort {
  load(uri: string): Promise<{ durationMs: number; sampleRate: number }>;
  /** Heard from Clock time `at`, starting `offsetMs` into the file, at `rate` (pitch kept). */
  start(o: { at: number; offsetMs: number; rate: number }): void;
  stop(): void;
  /** The file position heard at Clock time `at`, read from the render clock. Null when not playing. */
  anchor(): { at: number; fileMs: number } | null;
}

export interface AudioPort {
  /** False off iOS, in Expo Go, or without the module: every call is then a no-op and `start` rejects. */
  readonly available: boolean;
  /** The Clock the port's times are on (iOS: the MidiPort clock; both read mach_absolute_time). */
  readonly clock: Clock;
  /** Activates the session and starts the engine. Idempotent. Call when a play screen mounts and before every take. */
  start(): Promise<AudioRoute>;
  /** Stops the engine (battery) after the app's idle timeout. Pending events are dropped. */
  suspend(): void;
  route(): AudioRoute | null;
  /** Renders words for the count-in and countAloud. Resolves once each word is ready or known missing. */
  prepareWords(words: string[]): Promise<{ missing: string[] }>;
  /** Hands events over (any order, any distance ahead). Events already too late are dropped and counted. */
  schedule(events: AudioEvent[]): { accepted: number; late: number };
  /** Drops every event not yet sounding that is heard at or after `fromMs` (default: all). Sounding ones ring out. */
  cancel(fromMs?: number): void;
  /** Touch pads: plays now, lowest latency, synchronous. Returns the estimated heard time (Clock ms), or NaN when nothing plays (unknown sound, engine off). */
  playNow(sound: SoundId, gain: number): number;
  /** Bus levels 0..1 from settings (clickVolume, bandVolume, voiceVolume…). Not time-critical. */
  setLevels(levels: Partial<Record<'click' | 'drums' | 'band' | 'voice' | 'backing', number>>): void;
  readonly backing: BackingPort | null;   // null until Phase 3b
  onRouteChange(fn: (r: AudioRoute) => void): () => void;
  onInterruption(fn: (e: AudioInterruption) => void): () => void;
  /** `dropped` also counts malformed events and sounds that couldn't be resolved. */
  stats(): { scheduled: number; late: number; dropped: number; engineStarts: number; lastError?: string };
}
