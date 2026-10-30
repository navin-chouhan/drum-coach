// Mobile platform contracts (apps/mobile). Owned by the orchestrator: change only through docs/mobile/BOARD.md.
// Each interface has one owning agent that implements it; screens and other agents code against these types only.

import type { Clock } from '@drum-coach/core/platform';

/** A CoreMIDI source. `id` is its kMIDIPropertyUniqueID as a string. */
export type MidiInputInfo = { id: string; name: string; manufacturer: string; online: boolean };

/** One CoreMIDI packet as the native module delivers it: MIDI 1.0 bytes (maybe several messages) and times in ms. */
export type NativeMidiPacket = {
  bytes: number[];
  /** The packet's CoreMIDI host timestamp in ms (receive time when CoreMIDI said 0 = "now"). */
  hostTimeMs: number;
  /** When the native receive block ran, ms (same clock). */
  nativeReceivedMs: number;
};

/**
 * The native MIDI port (A3: modules/drum-midi + src/platform/midi.ts). Native code only forwards bytes and host times;
 * framing, note semantics and filtering run in @drum-coach/core.
 */
export interface MidiPort {
  /** False on Android/web or when the native module isn't in the build. Every method is then a safe no-op. */
  readonly available: boolean;
  /** The one clock: mach host time in ms. Use it as the core Clock on iOS. */
  readonly clock: Clock;
  listInputs(): MidiInputInfo[];
  /** Select one input by id (null = none). Idempotent: selecting the connected input again never doubles hits. */
  select(id: string | null): boolean;
  /** Auto-select the first online input whose name starts with one of these when it appears (default ['e-Drum']). */
  setPreferredNames(names: string[]): void;
  onInputsChanged(fn: (inputs: MidiInputInfo[]) => void): () => void;
  /** Packets in arrival order, batched natively (at most about one JS call per display frame). */
  onPackets(fn: (packets: NativeMidiPacket[]) => void): () => void;
  /** Lets a Mac send to the iPad over Network MIDI (tests T4/M8). */
  setNetworkSessionEnabled(on: boolean): boolean;
  debugInfo(): Record<string, unknown>;
}

/** Keeps the screen on while practising (A2: expo-keep-awake). */
export interface KeepAwake {
  activate(tag: string): void;
  deactivate(tag: string): void;
}

/** What this build/device can do; screens hide or explain what is missing (A2 fills it in). */
export type Capabilities = {
  midi: boolean;
  /** Always false on iOS (B13): no YouTube tab capture. */
  tabCapture: false;
  coachServer: 'unknown' | 'reachable' | 'unreachable' | 'not-configured';
};

// Phase 2 contracts (AudioPort, Storage, Api) are added here before A4/A5 start.
