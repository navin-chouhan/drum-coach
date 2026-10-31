// The MIDI port and its link to the hit bus, without React Native imports, so it runs in Vitest (midi.ts wires the
// real native module). Native code only forwards bytes and host times in batches (modules/drum-midi); framing, note
// semantics and every filter are @drum-coach/core's.

import type { HitBus } from '@drum-coach/core/input/hits';
import { createFramer, isRealtime, type FramerStats } from '@drum-coach/core/midi/framing';
import type { MidiInputInfo, MidiPort, NativeMidiPacket } from './contracts';
import { createSamples, type Samples } from './samples';

/** One native batch (modules/drum-midi `MidiPacketBatch`), with the fields the link uses. */
export type PacketBatch = {
  packets: NativeMidiPacket[];
  sentMs: number;
  reason: string;
  foregroundAtMs: number;
  backgroundAtMs: number;
};

export type MidiSelection = { selectedId: string; selectedName: string; connectedId: string; preferredNames: string[]; autoSelect: boolean };

/** The module wrapper's API (modules/drum-midi/index.ts) as the port needs it; tests pass a fake. */
export type DrumMidiApi = {
  available: boolean;
  nowMs: () => number;
  listInputs: () => MidiInputInfo[];
  select: (id: string | null) => boolean;
  setPreferredNames: (names: string[]) => boolean;
  getSelection: () => MidiSelection | null;
  setNetworkSessionEnabled: (on: boolean) => boolean;
  getDebugInfo: () => object | null;
  onPackets: (fn: (packets: NativeMidiPacket[], batch: PacketBatch) => void) => () => void;
  onInputsChanged: (fn: (inputs: MidiInputInfo[], selection: MidiSelection) => void) => () => void;
};

/** App lifecycle as RN's AppState exposes it (only what the port needs). */
export type AppStateLike = { addEventListener: (type: 'change', fn: (state: string) => void) => { remove: () => void } };

export type Lifecycle = {
  /** Last time the app came to the foreground, on the port's clock (0 = not since start). */
  foregroundAtMs: number;
  /** Last time it went to the background (0 = not since start). */
  backgroundAtMs: number;
};

/** MidiPort plus what the hit link and the debug screen need: whole batches, lifecycle marks, the selection. */
export interface DrumMidiPort extends MidiPort {
  /** Every native batch with its timing; the port has updated lifecycle() before calling. */
  onBatch(fn: (batch: PacketBatch) => void): () => void;
  lifecycle(): Lifecycle;
  selection(): MidiSelection | null;
  /**
   * Drops any explicit selection and auto-selects by `names` (default: the current preferred names, else
   * DEFAULT_PREFERRED_NAMES). The native hub's setPreferredNames alone keeps an explicit selection.
   */
  autoSelect(names?: string[]): void;
}

/** The contract's default: the MPS-150 shows as "e-Drum" on iOS (CLAUDE.md). */
export const DEFAULT_PREFERRED_NAMES = ['e-Drum'];

const startsWithAny = (name: string, prefixes: readonly string[]) =>
  prefixes.some(p => p.trim() !== '' && name.toLowerCase().startsWith(p.trim().toLowerCase()));

/**
 * QA2 M4: the selected source is gone (offline or no longer listed) and auto-select is on, so the port should drop the
 * selection and fall back to the preferred names: the web listens to the saved input when it's there, else to the
 * first one (src/input/useMidi.ts `effective`). The native hub instead keeps a dead selection and connects nothing,
 * so after the Network MIDI session is switched off the kit stayed disconnected. A gone preferred source (the kit
 * unplugged) is left alone: the hub reconnects it by name when it comes back.
 */
export function selectionIsGone(inputs: readonly MidiInputInfo[], sel: MidiSelection | null): boolean {
  if (!sel || !sel.autoSelect || sel.connectedId !== '') return false;
  if (sel.selectedId === '' && sel.selectedName === '') return false;
  if (sel.selectedName !== '' && startsWithAny(sel.selectedName, sel.preferredNames)) return false;
  const live = inputs.filter(i => i.online);
  return !live.some(i => (sel.selectedId !== '' && i.id === sel.selectedId) || (sel.selectedName !== '' && i.name === sel.selectedName));
}

/**
 * The port over the native module. One native subscription per event kind, made when the first listener comes and
 * removed with the last, fans out to every listener. Sets the preferred names to DEFAULT_PREFERRED_NAMES at once.
 * Lifecycle marks: the latest of the native ones (sent with each batch, B25) and AppState's, both on the host clock.
 */
export function createMidiPortFrom(api: DrumMidiApi, appState?: AppStateLike): DrumMidiPort {
  const clock = { now: api.nowMs }; // off iOS the wrapper falls back to performance.now()
  const batchListeners = new Set<(b: PacketBatch) => void>();
  const inputListeners = new Set<(inputs: MidiInputInfo[]) => void>();
  let offNativePackets: (() => void) | null = null;
  let offNativeInputs: (() => void) | null = null;
  const native: Lifecycle = { foregroundAtMs: 0, backgroundAtMs: 0 };
  const js: Lifecycle = { foregroundAtMs: 0, backgroundAtMs: 0 };

  if (api.available) {
    appState?.addEventListener('change', state => {
      if (state === 'active') js.foregroundAtMs = clock.now();
      else if (state === 'background') js.backgroundAtMs = clock.now();
    });
    api.setPreferredNames(DEFAULT_PREFERRED_NAMES);
    // Always on (one per port): a selection whose source went away falls back to auto-select (selectionIsGone).
    api.onInputsChanged((inputs, sel) => { if (selectionIsGone(inputs, sel)) autoSelect(sel.preferredNames); });
  }

  function autoSelect(names?: string[]) {
    if (!api.available) return;
    const sel = api.getSelection();
    const prefs = names?.length ? names : sel?.preferredNames.length ? sel.preferredNames : DEFAULT_PREFERRED_NAMES;
    const connectedName = sel?.connectedId ? api.listInputs().find(i => i.id === sel.connectedId)?.name : undefined;
    // Already on a preferred source: keep the connection (select(null) would drop it and reconnect).
    if (!(connectedName && startsWithAny(connectedName, prefs))) api.select(null); // clears the selection (and auto-select)
    api.setPreferredNames(prefs); // auto-select on again, now with nothing selected
  }

  function onBatch(fn: (b: PacketBatch) => void) {
    if (!api.available) return () => {};
    batchListeners.add(fn);
    offNativePackets ??= api.onPackets((_packets, batch) => {
      native.foregroundAtMs = Math.max(native.foregroundAtMs, batch.foregroundAtMs);
      native.backgroundAtMs = Math.max(native.backgroundAtMs, batch.backgroundAtMs);
      batchListeners.forEach(l => l(batch));
    });
    return () => {
      batchListeners.delete(fn);
      if (!batchListeners.size && offNativePackets) { offNativePackets(); offNativePackets = null; }
    };
  }

  function onInputsChanged(fn: (inputs: MidiInputInfo[]) => void) {
    if (!api.available) return () => {};
    inputListeners.add(fn);
    offNativeInputs ??= api.onInputsChanged(inputs => inputListeners.forEach(l => l(inputs)));
    return () => {
      inputListeners.delete(fn);
      if (!inputListeners.size && offNativeInputs) { offNativeInputs(); offNativeInputs = null; }
    };
  }

  return {
    available: api.available,
    clock,
    listInputs: () => (api.available ? api.listInputs() : []),
    select: id => (api.available ? api.select(id) : false),
    setPreferredNames: names => { if (api.available) api.setPreferredNames(names); },
    onInputsChanged,
    onPackets: fn => onBatch(b => fn(b.packets)),
    onBatch,
    setNetworkSessionEnabled: on => (api.available ? api.setNetworkSessionEnabled(on) : false),
    debugInfo: () => ({ available: api.available, ...(api.available ? api.getDebugInfo() : null), lifecycle: { native: { ...native }, js: { ...js } } }),
    lifecycle: () => ({
      foregroundAtMs: Math.max(native.foregroundAtMs, js.foregroundAtMs),
      backgroundAtMs: Math.max(native.backgroundAtMs, js.backgroundAtMs),
    }),
    selection: () => (api.available ? api.getSelection() : null),
    autoSelect,
  };
}

// ---- The link: native batches → framing → stale drop → hit bus ----

/** A packet more than this much older than its JS receipt is stale... */
export const STALE_AGE_MS = 250;
/** ...and is dropped when it arrives this soon after a foreground (or while the app is backgrounded): B25. */
export const RESUME_WINDOW_MS = 1000;

/**
 * B25: CoreMIDI queues packets while the app is in the background and delivers them on resume with their old
 * timestamps (seen: 48.7 s). They must not become hits. A packet late for any other reason (a busy JS thread) is kept:
 * scoring uses its host time.
 */
export function isStale(hostTimeMs: number, receivedMs: number, life: Lifecycle): boolean {
  if (receivedMs - hostTimeMs <= STALE_AGE_MS) return false;
  const backgrounded = life.backgroundAtMs > life.foregroundAtMs;
  const justResumed = life.foregroundAtMs > 0 && receivedMs - life.foregroundAtMs < RESUME_WINDOW_MS;
  return backgrounded || justResumed;
}

export type MidiCounters = {
  batches: number;
  packets: number;
  messages: number;
  clock: number;
  activeSensing: number;
  otherRealtime: number;
  noteOns: number;
  /** Messages dropped as stale after a resume (B25), and the oldest such age, ms. */
  staleDropped: number;
  staleMaxAgeMs: number;
  /** Packets whose host time went back from the previous packet's. */
  timeWentBack: number;
  maxBatchPackets: number;
  batchReasons: Record<string, number>;
  framer: FramerStats;
};

export type MidiDelays = {
  /** JS receipt − hostTimeMs of each note-on packet: what a hit costs from the kit to JS (the M6 number). */
  hit: Samples;
  /** JS receipt − native send time of each batch: the bridge alone. */
  bridge: Samples;
  /** Native send time − arrival of a batch's first packet: how long native batching held it. */
  hold: Samples;
};

export type MidiLink = {
  unsubscribe: () => void;
  /** Live: the same object is updated in place as batches arrive. */
  counters: MidiCounters;
  delays: MidiDelays;
  /** Zeroes the counters and delays (the framer keeps any message in progress). */
  reset: () => void;
};

const zeroCounters = (framer: FramerStats): MidiCounters => ({
  batches: 0, packets: 0, messages: 0, clock: 0, activeSensing: 0, otherRealtime: 0, noteOns: 0,
  staleDropped: 0, staleMaxAgeMs: 0, timeWentBack: 0, maxBatchPackets: 0, batchReasons: {}, framer,
});

/**
 * Feeds the port into the hit bus: each batch's packets are framed (one framer for the connection, so a message split
 * across packets survives), and each message goes to `bus.receiveMidi(bytes, hostTimeMs)` unless its packet is stale
 * after a resume. The bus does the rest (note map, Note On only, bounce and crosstalk filters, velocity curve).
 */
export function connectMidiToHitBus(port: DrumMidiPort, bus: Pick<HitBus, 'receiveMidi'>): MidiLink {
  const framer = createFramer();
  const counters = zeroCounters(framer.stats);
  const delays: MidiDelays = { hit: createSamples(), bridge: createSamples(), hold: createSamples() };
  let lastHostMs = -Infinity;

  const unsubscribe = port.onBatch(batch => {
    const receivedMs = port.clock.now(); // first thing: the delays are measured to here
    const life = port.lifecycle();
    counters.batches++;
    counters.batchReasons[batch.reason] = (counters.batchReasons[batch.reason] ?? 0) + 1;
    counters.maxBatchPackets = Math.max(counters.maxBatchPackets, batch.packets.length);
    delays.bridge.add(receivedMs - batch.sentMs);
    if (batch.packets.length) delays.hold.add(batch.sentMs - batch.packets[0].nativeReceivedMs);
    for (const p of batch.packets) {
      counters.packets++;
      if (p.hostTimeMs < lastHostMs) counters.timeWentBack++;
      lastHostMs = p.hostTimeMs;
      const stale = isStale(p.hostTimeMs, receivedMs, life);
      let hasNoteOn = false;
      for (const msg of framer.push(p.bytes)) {
        counters.messages++;
        const status = msg[0];
        const noteOn = (status & 0xf0) === 0x90 && msg[2] > 0;
        if (status === 0xf8) counters.clock++;
        else if (status === 0xfe) counters.activeSensing++;
        else if (isRealtime(status)) counters.otherRealtime++;
        if (stale) {
          counters.staleDropped++;
          counters.staleMaxAgeMs = Math.max(counters.staleMaxAgeMs, receivedMs - p.hostTimeMs);
          continue;
        }
        if (noteOn) { counters.noteOns++; hasNoteOn = true; }
        bus.receiveMidi(msg, p.hostTimeMs);
      }
      if (hasNoteOn) delays.hit.add(receivedMs - p.hostTimeMs);
    }
  });

  return {
    unsubscribe,
    counters,
    delays,
    reset() {
      Object.assign(counters, zeroCounters(framer.stats));
      framer.stats.messages = 0; framer.stats.droppedBytes = 0; framer.stats.sysex = 0;
      delays.hit.reset(); delays.bridge.reset(); delays.hold.reset();
      lastHostMs = -Infinity;
    },
  };
}
