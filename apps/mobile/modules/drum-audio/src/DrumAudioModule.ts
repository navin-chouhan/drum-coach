import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type {
  BackingLoadResult, BackingStartResult, BusVolumes, DrumAudioApi, DrumAudioEvents, NativeBackingAnchor, NativeRoute, NativeStats,
  PreparedWords, ScheduleResult, TimingProbeResult,
} from './DrumAudio.types';

declare class DrumAudioNative extends NativeModule<DrumAudioEvents> implements DrumAudioApi {
  nowMs(): number;
  start(): Promise<NativeRoute>;
  suspend(): void;
  route(): NativeRoute | null;
  prepareWords(words: string[]): Promise<PreparedWords>;
  schedule(packed: number[]): ScheduleResult;
  cancel(fromMs: number | null): void;
  playNow(index: number, gain: number): number;
  setBusVolumes(volumes: BusVolumes): void;
  stats(): NativeStats;
  debugInfo(): Record<string, unknown>;
  startTimingProbe(): boolean;
  stopTimingProbe(): TimingProbeResult;
  backingLoad(uri: string): Promise<BackingLoadResult>;
  backingStart(at: number, offsetMs: number, rate: number): BackingStartResult;
  backingStop(): void;
  backingAnchor(): NativeBackingAnchor;
  backingTestTone(bpm: number, beatsPerBar: number, seconds: number): Promise<string>;
}

/**
 * The native module, or null where it doesn't exist (Android, web, Expo Go, a build without it).
 * Callers check `available` and degrade instead of crashing.
 */
export const native: DrumAudioApi | null = Platform.OS === 'ios' ? requireOptionalNativeModule<DrumAudioNative>('DrumAudio') : null;
