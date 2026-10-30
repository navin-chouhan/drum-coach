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

// AudioPort lives in core (@drum-coach/core/play/audioPort): createTake uses it on every platform. A4 implements it
// in src/platform/audio.ts on the drum-audio module.

/** What GET /api/health says about the home server (server/guard.ts `health`). */
export type ServerHealth = { ok: true; version: string; coach: boolean; tts: boolean; stt: boolean; youtube: boolean };

export type ApiFailure = {
  ok: false;
  reason: 'not-configured' | 'unreachable' | 'unauthorized' | 'forbidden' | 'rate-limited' | 'bad-response' | 'server-error';
  status?: number;
  detail?: string;
};

/**
 * The home server (D2: the owner's Mac or Linux machine running `npm run server` with APP_TOKEN). A5 implements it in
 * src/platform/api.ts. The URL lives in the key-value store; the token lives only in expo-secure-store (Keychain).
 * Never throws: every failure is a typed ApiFailure that screens can show.
 */
export interface HomeServer {
  configure(cfg: { url: string; token: string } | null): Promise<void>;
  configured(): { url: string } | null;
  health(): Promise<ServerHealth | ApiFailure>;
  /** A JSON call with `Authorization: Bearer <token>`; `path` starts with /api/. Times out (default 30 s, coach 120 s). */
  call<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: `/api/${string}`, body?: unknown,
    opts?: { timeoutMs?: number }): Promise<{ ok: true; data: T } | ApiFailure>;
  /**
   * A streamed POST (server-sent events, e.g. /api/coach/session) over expo/fetch. `onEvent` gets each event as it
   * arrives (`json` when its data parses). The timeout covers the whole stream; an abort resolves as cancelled.
   */
  stream(path: `/api/${string}`, body: unknown, onEvent: (e: HomeServerEvent) => void,
    opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<StreamResult>;
}

/** One server-sent event: its `event:` name ('message' when none), `data`, and `json` when the data parses. */
export type HomeServerEvent = { event: string; data: string; id?: string; json?: unknown };
export type StreamResult = { ok: true; events: number; cancelled?: true } | ApiFailure;

/**
 * On-device storage (D3: the iPad is the source of truth). A5 implements it in src/platform/storage.ts on expo-sqlite,
 * with tables and row shapes mirroring server/db.ts, so the screens' logic ports from the web app unchanged.
 * `kv` is synchronous (the core KeyValueStore: settings, note maps, pad calibration).
 */
export interface Storage {
  readonly kv: import('@drum-coach/core/platform').KeyValueStore;
  /** Runs (takes) as the web's POST/GET /api/runs shape them; A5 defines RunInput/RunRow next to the schema. */
  runs: {
    add(run: unknown): Promise<string>;
    list(q?: { since?: number; limit?: number }): Promise<unknown[]>;
    take(id: string): Promise<unknown | null>;
  };
}
