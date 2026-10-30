// Drum Coach's MIDI module: CoreMIDI input with host timestamps, delivered in native batches (onPackets), selection by
// preferred name and Network MIDI. No audio: clicks and the audio session are modules/drum-audio's (one session
// owner). iOS only; every function degrades gracefully elsewhere (empty lists, false, null, performance.now(), a
// no-op unsubscribe).
// apps/mobile/src/platform/midi.ts wraps this into the app's `MidiPort` (contracts.ts).

import { native } from './src/DrumMidiModule';
import type { DebugInfo, MidiInput, MidiPacket, MidiPacketBatch, MidiSelection } from './src/DrumMidi.types';

export * from './src/DrumMidi.types';
export { classifyPacket, defaultBatchPolicy, type BatchPolicy, type FlushReason, type PacketKind } from './src/batchPolicy';

/** True when the native module is linked (an iOS development or release build). */
export const available = native != null;

const noop = () => {};

/** The one monotonic ms clock (mach host time). Off iOS: performance.now(), which is NOT the same base. */
export const nowMs = (): number => (native ? native.nowMs() : performance.now());

export const listInputs = (): MidiInput[] => native?.listInputs() ?? [];

/** Listen to one source (by MidiInput.id), or none (which also turns auto-select off). Idempotent. Returns whether a source is connected. */
export const select = (id: string | null): boolean => native?.select(id) ?? false;

/**
 * With nothing selected, auto-select the first online source whose name starts with one of `names`
 * (case-insensitive, in order), now and whenever one appears or comes back after a replug. [] turns it off.
 * Returns whether a source is connected.
 */
export const setPreferredNames = (names: string[]): boolean => native?.setPreferredNames(names) ?? false;

export const getSelection = (): MidiSelection | null => native?.getSelection() ?? null;

/** Publishes this device as a Network MIDI session (policy: anyone) so a Mac can send to it (M8). */
export const setNetworkSessionEnabled = (enabled: boolean): boolean => native?.setNetworkSessionEnabled(enabled) ?? false;

export const getDebugInfo = (): DebugInfo | null => native?.getDebugInfo() ?? null;

/**
 * Packets in arrival order, one call per native batch (a note-on is sent at once; other messages within 8 ms,
 * clock/active-sensing-only batches within 33 ms). Returns an unsubscribe function.
 */
export function onPackets(fn: (packets: MidiPacket[], batch: MidiPacketBatch) => void): () => void {
  if (!native) return noop;
  const sub = native.addListener('onPackets', batch => fn(batch.packets, batch));
  return () => sub.remove();
}

/** The source list (and the selection) on every CoreMIDI setup change. Returns an unsubscribe function. */
export function onInputsChanged(fn: (inputs: MidiInput[], selection: MidiSelection) => void): () => void {
  if (!native) return noop;
  const sub = native.addListener('onInputsChanged', e => fn(e.inputs, e.selection));
  return () => sub.remove();
}
