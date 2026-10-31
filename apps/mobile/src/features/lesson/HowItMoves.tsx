// "How it moves" (R5) on the iPad: the web's TechniqueDemo drawn in a DOM component (src/play/dom/TechniqueDom.tsx),
// with the app's settings (left-handed, the coach's voice) and the coach's voice (expo-speech) as its native action.
import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { DemoId } from '@drum-coach/core/content/demos';
import { DEMOS } from '@drum-coach/core/content/demos';
import TechniqueDom from '../../play/dom/TechniqueDom';
import { useAppSettings } from '../../ui';
import { sayNext, sayNow } from '../coach/voice';

const speak = async (text: string, now: boolean) => { if (now) sayNow(text); else sayNext(text); };

export function HowItMoves({ id, bpm, compact, heelUp, playing = false, style, testID }: {
  id: DemoId; bpm: number; compact?: boolean; heelUp?: boolean; playing?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const s = useAppSettings();
  return (
    <View style={[{ overflow: 'hidden' }, style]} testID={testID} accessibilityLabel={`How it moves: ${DEMOS[id].title}, animated`}>
      <TechniqueDom id={id} bpm={bpm} compact={compact} heelUp={heelUp} mirror={!!s.leftHanded} canSpeak={s.voice !== false && !playing} say={speak}
        dom={{ style: { flex: 1, backgroundColor: 'transparent' }, scrollEnabled: !compact, bounces: false, overScrollMode: 'never' }} />
    </View>
  );
}
