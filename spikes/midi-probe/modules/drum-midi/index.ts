// Drum Coach Gate 0 MIDI module: CoreMIDI input with host timestamps, Network MIDI, host-time clicks. iOS only;
// every function degrades gracefully elsewhere (empty lists, false, performance.now(), a rejected promise).

import type { EventSubscription } from 'expo';

import { native } from './src/DrumMidiModule';
import type { AudioInfo, ClickSchedule, DebugInfo, MidiInput, MidiPacketEvent } from './src/DrumMidi.types';

export * from './src/DrumMidi.types';

/** True when the native module is linked (an iOS development build). */
export const available = native != null;

const none: EventSubscription = { remove() {} };

/** The one monotonic ms clock (mach host time). Off iOS: performance.now(), which is NOT the same base. */
export const nowMs = (): number => (native ? native.nowMs() : performance.now());

export const listInputs = (): MidiInput[] => native?.listInputs() ?? [];

/** Listen to one source (by MidiInput.id), or none. Idempotent. Returns whether a source is connected. */
export const select = (id: string | null): boolean => native?.select(id) ?? false;

/** Publishes this device as a Network MIDI session (policy: anyone) so a Mac can send to it (M8). */
export const setNetworkSessionEnabled = (enabled: boolean): boolean => native?.setNetworkSessionEnabled(enabled) ?? false;

export const getDebugInfo = (): DebugInfo | null => native?.getDebugInfo() ?? null;

export const getAudioInfo = (): AudioInfo | null => native?.getAudioInfo() ?? null;

/** Clicks at host times (AVAudioPlayerNode + AVAudioTime(hostTime:)): the same clock as MIDI hostTimeMs. */
export const scheduleClicks = (startHostTimeMs: number, bpm: number, count: number, accentEvery = 4): Promise<ClickSchedule> =>
  native ? native.scheduleClicks(startHostTimeMs, bpm, count, accentEvery) : Promise.reject(new Error('DrumMidi is iOS only'));

export const stopClicks = (): void => native?.stopClicks();

export const addMidiListener = (fn: (e: MidiPacketEvent) => void): EventSubscription => native?.addListener('onMidi', fn) ?? none;

export const addInputsListener = (fn: (inputs: MidiInput[]) => void): EventSubscription =>
  native?.addListener('onInputsChanged', e => fn(e.inputs)) ?? none;
