import type { FlushReason } from './batchPolicy';

/**
 * A CoreMIDI source. `id` is its kMIDIPropertyUniqueID as a string (it can change across a replug; the name is the
 * stable key). Same shape as `MidiInputInfo` in apps/mobile/src/platform/contracts.ts.
 */
export type MidiInput = { id: string; name: string; manufacturer: string; online: boolean };

/**
 * One CoreMIDI packet: its MIDI 1.0 bytes (maybe several messages; frame them in TS) and its times, all nowMs().
 * Same shape as `NativeMidiPacket` in contracts.ts.
 */
export type MidiPacket = {
  bytes: number[];
  /** The packet's CoreMIDI host timestamp in ms (the receive time when CoreMIDI said 0 = "now"). */
  hostTimeMs: number;
  /** When the native receive block ran, ms. */
  nativeReceivedMs: number;
};

/** One `onPackets` event: the packets native code collected (BatchPolicy), in arrival order. */
export type MidiPacketBatch = {
  packets: MidiPacket[];
  /** When native code sent the batch, ms. JS receipt − sentMs = the bridge's own delay. */
  sentMs: number;
  reason: FlushReason;
  /** When the app last entered the foreground / background, ms (0 = not yet). For the stale drop after a resume (B25). */
  foregroundAtMs: number;
  backgroundAtMs: number;
};

/** The hub's selection. Empty strings mean none. */
export type MidiSelection = {
  selectedId: string;
  selectedName: string;
  connectedId: string;
  preferredNames: string[];
  autoSelect: boolean;
};

export type DebugInfo = {
  started: boolean;
  connectCalls: number;
  disconnectCalls: number;
  setupNotifications: number;
  connected: boolean;
  connectedName: string;
  connectedId: string;
  selectedId: string;
  selectedName: string;
  preferredNames: string[];
  autoSelect: boolean;
  packetsReceived: number;
  zeroTimestampPackets: number;
  lastError: number;
  networkSessionEnabled: boolean;
  networkSessionName: string;
  timebase: string;
  // Batching (PacketBatcher)
  batchPolicy: string;
  batches: number;
  batchedPackets: number;
  pendingPackets: number;
  maxBatchPackets: number;
  /** How long the oldest packet of the last / any batch waited natively, ms. */
  lastHoldMs: number;
  maxHoldMs: number;
  flushNoteOn: number;
  flushDeadline: number;
  flushFull: number;
  foregroundAtMs: number;
  backgroundAtMs: number;
};

export type DrumMidiEvents = {
  onInputsChanged: (e: { inputs: MidiInput[]; selection: MidiSelection }) => void;
  onPackets: (e: MidiPacketBatch) => void;
};
