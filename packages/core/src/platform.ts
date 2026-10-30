// Platform contracts for @drum-coach/core. Owned by the orchestrator: change only through docs/mobile/BOARD.md.
// The core never touches window, document, navigator, localStorage, fetch, performance or React; each app injects these.

/**
 * The one monotonic millisecond clock. Web: performance.now() (the same clock as MIDIMessageEvent.timeStamp).
 * iOS: mach host time in ms (DrumMidi.nowMs(), the same base as CoreMIDI packet timestamps).
 * Hit times, click/backing schedule times and latency offsets must all be on the same Clock; scoring only ever
 * compares times from one Clock, so its absolute value (0 or 1e9) never matters.
 */
export interface Clock {
  now(): number;
}

/** A synchronous string key-value store. Web: localStorage. iOS: expo-sqlite's key-value store. Never throws. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Optional fire-and-forget mirror of a setting to a server (web: PUT /api/settings/:key). */
export interface SyncClient {
  putSetting(key: string, value: unknown): void;
}

/** One framed MIDI 1.0 message with its time on the Clock. */
export type TimedMidi = { bytes: ArrayLike<number>; time: number };
