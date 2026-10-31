// "How it moves" (R5) on the iPad: the web's TechniqueDemo drawn in a DOM component (src/play/dom/TechniqueDom.tsx),
// with the app's settings (left-handed, the coach's voice) and the coach's voice (expo-speech) as its native action.
import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { DemoId } from '@drum-coach/core/content/demos';
import { DEMOS } from '@drum-coach/core/content/demos';
import TechniqueDom from '../../play/dom/TechniqueDom';
import { useAppSettings } from '../../ui';
import { sayNext, sayNow } from '../coach/voice';

const speak = async (text: string, now: boolean) => { if (now) sayNow(text); else sayNext(text); };

const DOM_FULL = { style: { flex: 1, backgroundColor: 'transparent' }, scrollEnabled: true, bounces: false, overScrollMode: 'never' } as const;
const DOM_COMPACT = { ...DOM_FULL, scrollEnabled: false } as const;

export function HowItMoves({ id, bpm, compact, heelUp, playing = false, style, testID }: {
  id: DemoId; bpm: number; compact?: boolean; heelUp?: boolean; playing?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const s = useAppSettings();
  const mirror = !!s.leftHanded, canSpeak = s.voice !== false && !playing;
  // The same element while nothing it shows changed: Expo's DOM wrapper re-sends every prop into the WebView on each
  // render (W3's NotationView fix), and the lesson player re-renders often.
  const dom = useMemo(() => (
    <TechniqueDom id={id} bpm={bpm} compact={compact} heelUp={heelUp} mirror={mirror} canSpeak={canSpeak} say={speak} dom={compact ? DOM_COMPACT : DOM_FULL} />
  ), [id, bpm, compact, heelUp, mirror, canSpeak]);
  return (
    <View style={[{ overflow: 'hidden' }, style]} testID={testID} accessibilityLabel={`How it moves: ${DEMOS[id].title}, animated`}>
      {dom}
    </View>
  );
}
