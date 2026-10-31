import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';

export type NativePlayerProps = {
  /** The first video (later ones are `load` commands). */
  videoId: string;
  onPlayerEvent: (e: { nativeEvent: unknown }) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** The view's imperative side: one YtCommand as JSON. */
export type NativePlayerRef = { command(json: string): Promise<void> };

/** True when the native module is linked (an iOS development or release build that has it). */
export const linked: boolean = Platform.OS === 'ios' && requireOptionalNativeModule('DrumYouTube') != null;

/** The native view, or null where it doesn't exist (Android, web, Expo Go, a build without it). */
export const NativePlayer: ComponentType<NativePlayerProps & { ref?: React.Ref<NativePlayerRef> }> | null =
  linked ? requireNativeView<NativePlayerProps>('DrumYouTube') : null;
