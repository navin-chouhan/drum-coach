// MidiPort (contracts.ts) on the DrumMidi native module (modules/drum-midi). The logic is in midiCore.ts (tested in
// Vitest); this file only wires the real module and AppState.
import { AppState } from 'react-native';
import * as DrumMidi from '../../modules/drum-midi';
import { createMidiPortFrom, type DrumMidiPort } from './midiCore';

export {
  connectMidiToHitBus, isStale, DEFAULT_PREFERRED_NAMES, RESUME_WINDOW_MS, STALE_AGE_MS,
  type DrumMidiPort, type Lifecycle, type MidiCounters, type MidiDelays, type MidiLink, type PacketBatch,
} from './midiCore';

/** A new port over the native module. Most code wants getMidiPort() (one per app). */
export function createMidiPort(): DrumMidiPort {
  return createMidiPortFrom(DrumMidi, AppState);
}

// One port per JS runtime, kept across Fast Refresh: a second port would mean a second set of subscriptions.
type G = { __drumMidiPort?: DrumMidiPort };
const g = globalThis as G;

/** The app's one MIDI port. */
export function getMidiPort(): DrumMidiPort {
  return (g.__drumMidiPort ??= createMidiPort());
}
