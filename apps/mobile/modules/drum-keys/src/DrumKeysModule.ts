import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { DebugInfo, DrumKeysEvents } from './DrumKeys.types';

declare class DrumKeysNative extends NativeModule<DrumKeysEvents> {
  nowMs(): number;
  setEnabled(enabled: boolean): void;
  refocus(): void;
  getDebugInfo(): DebugInfo;
}

/**
 * The native module, or null where it doesn't exist (Android, web, Expo Go, a build without it).
 * Callers check `available` and degrade instead of crashing.
 */
export const native: DrumKeysNative | null = Platform.OS === 'ios' ? requireOptionalNativeModule<DrumKeysNative>('DrumKeys') : null;
