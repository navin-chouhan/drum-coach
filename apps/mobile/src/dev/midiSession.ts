// The MIDI debug screen's engine, outside React (no React Native imports, so it is tested in Vitest): a hit bus on the
// port's clock, the port linked to it, a short hit log and a snapshot for the screen and for "Copy debug info".
// The screen reads snapshot() on a timer, so neither clock messages nor hits re-render it directly (B24).

import { DEFAULT_NOTE_MAP, PAD_INFO, PADS, type PadId } from '@drum-coach/core/engine/kit';
import { createHitBus, type Hit, type HitBus } from '@drum-coach/core/input/hits';
import type { MidiInputInfo } from '../platform/contracts';
import { connectMidiToHitBus, type DrumMidiPort, type MidiCounters, type MidiLink } from '../platform/midiCore';
import type { Summary } from '../platform/samples';

export type LoggedHit = {
  pad: PadId | null;
  name: string;
  note: number;
  velocity: number;
  /** ms since the session started, on the port's clock. */
  atMs: number;
  /** ms since the previous hit (null for the first). */
  sinceLastMs: number | null;
  /** From the on-screen pads rather than the kit. */
  emulated: boolean;
};

export type MidiSnapshot = {
  available: boolean;
  inputs: MidiInputInfo[];
  selection: ReturnType<DrumMidiPort['selection']>;
  counters: MidiCounters;
  hits: number;
  log: LoggedHit[];
  delays: { hit: Summary | null; bridge: Summary | null; hold: Summary | null };
  native: Record<string, unknown>;
};

export type MidiDebugSession = {
  bus: HitBus;
  link: MidiLink;
  /** Plays a pad through the same path as the kit (no kit needed: simulator, Maestro, a quick check). */
  tapPad: (pad: PadId, velocity?: number) => void;
  snapshot: () => MidiSnapshot;
  /** Everything worth pasting back, as plain data. */
  report: () => Record<string, unknown>;
  reset: () => void;
  stop: () => void;
};

export const LOG_SIZE = 40;

export function createMidiDebugSession(port: DrumMidiPort, opts: { listInputs?: () => MidiInputInfo[] } = {}): MidiDebugSession {
  const listInputs = opts.listInputs ?? (() => safe(() => port.listInputs(), []));
  const bus = createHitBus({ now: () => port.clock.now(), getNoteMap: () => DEFAULT_NOTE_MAP, getPadCal: () => ({}) });
  const link = connectMidiToHitBus(port, bus);
  let startedAt = port.clock.now();
  let log: LoggedHit[] = [];
  let hits = 0;
  let lastHitTime: number | null = null;
  let emulating = false;

  const offHit = bus.onHit((h: Hit) => {
    hits++;
    const entry: LoggedHit = {
      pad: h.pad ?? null,
      name: h.pad ? PAD_INFO[h.pad].name : `note ${h.note}`,
      note: h.note,
      velocity: h.velocity,
      atMs: round1(h.time - startedAt),
      sinceLastMs: lastHitTime == null ? null : round1(h.time - lastHitTime),
      emulated: emulating,
    };
    lastHitTime = h.time;
    log = [entry, ...log].slice(0, LOG_SIZE);
  });

  function tapPad(pad: PadId, velocity = 100) {
    emulating = true;
    try { bus.emitPad(pad, velocity); } finally { emulating = false; }
  }

  function snapshot(): MidiSnapshot {
    return {
      available: port.available,
      inputs: listInputs(),
      selection: safe(() => port.selection(), null),
      counters: { ...link.counters, batchReasons: { ...link.counters.batchReasons }, framer: { ...link.counters.framer } },
      hits,
      log,
      delays: { hit: link.delays.hit.summary(), bridge: link.delays.bridge.summary(), hold: link.delays.hold.summary() },
      native: safe(() => port.debugInfo(), {}),
    };
  }

  return {
    bus,
    link,
    tapPad,
    snapshot,
    report: () => ({ kind: 'drum-coach-midi-debug', pads: PADS.length, ...snapshot() }),
    reset() {
      link.reset();
      bus.reset();
      log = [];
      hits = 0;
      lastHitTime = null;
      startedAt = port.clock.now();
    },
    stop() {
      offHit();
      link.unsubscribe();
    },
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback; // a CoreMIDI error (thrown by the native module) must not take the screen down
  }
}
