/** A CoreMIDI source. `id` is its kMIDIPropertyUniqueID as a string. */
export type MidiInput = { id: string; name: string; manufacturer: string; online: boolean };

/** One CoreMIDI packet: its MIDI 1.0 bytes (maybe several messages; frame them in TS) and its times, all nowMs(). */
export type MidiPacketEvent = {
  bytes: number[];
  /** The packet's CoreMIDI host timestamp in ms (the receive time when CoreMIDI said 0 = "now"). */
  hostTimeMs: number;
  /** When our receive block ran, ms. */
  nativeReceivedMs: number;
};

export type AudioInfo = { outputLatencyMs: number; ioBufferMs: number; sampleRate: number; route?: string };

export type ClickSchedule = AudioInfo & { scheduledHostTimesMs: number[] };

export type DebugInfo = {
  started: boolean;
  connectCalls: number;
  disconnectCalls: number;
  setupNotifications: number;
  connected: boolean;
  connectedName: string;
  selectedId: string;
  selectedName: string;
  packetsReceived: number;
  zeroTimestampPackets: number;
  lastError: number;
  networkSessionEnabled: boolean;
  networkSessionName: string;
  timebase: string;
};

export type DrumMidiEvents = {
  onInputsChanged: (e: { inputs: MidiInput[] }) => void;
  onMidi: (e: MidiPacketEvent) => void;
};
