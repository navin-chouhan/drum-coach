import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { AudioInfo, ClickSchedule, DebugInfo, DrumMidiEvents, MidiInput, MidiSelection } from './DrumMidi.types';

declare class DrumMidiNative extends NativeModule<DrumMidiEvents> {
  nowMs(): number;
  listInputs(): MidiInput[];
  select(id: string | null): boolean;
  setPreferredNames(names: string[]): boolean;
  getSelection(): MidiSelection;
  setNetworkSessionEnabled(enabled: boolean): boolean;
  getDebugInfo(): DebugInfo;
  getAudioInfo(): AudioInfo;
  scheduleClicks(startHostTimeMs: number, bpm: number, count: number, accentEvery: number): Promise<ClickSchedule>;
  stopClicks(): void;
}

/**
 * The native module, or null where it doesn't exist (Android, web, Expo Go, a build without it).
 * Callers check `available` and degrade instead of crashing.
 */
export const native: DrumMidiNative | null = Platform.OS === 'ios' ? requireOptionalNativeModule<DrumMidiNative>('DrumMidi') : null;
