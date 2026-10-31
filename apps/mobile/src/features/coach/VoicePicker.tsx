// Setup → Coach and voice → "Coach's voice" (D10 voice first, option A): the English voices installed on the iPad,
// best first (Premium, Enhanced, then the compact ones), "Best installed" by default. Picking one says a line in it.
// More voices: iOS Settings → Accessibility → Spoken Content → Voices (Enhanced / Premium are a download).
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Body, Button, color } from '../../ui';
import { chooseVoice, currentVoice, installedVoices, sayNow } from './voice';
import { englishVoices, VOICE_ID_KEY, voiceLabel, type VoiceInfo } from './voicePick';
import { getStorage } from '../../platform/storage';

export const VOICE_HELP = 'More voices, and the Enhanced and Premium ones that sound best: iOS Settings → Accessibility → Spoken Content → Voices → English.';
const SAMPLE = 'This is how I sound. Ready when you are.';

export function VoicePicker({ testID = 'voice-picker' }: { testID?: string }) {
  const [list, setList] = useState<VoiceInfo[] | null>(null);
  const [saved, setSaved] = useState<string | null>(() => { try { return getStorage().kv.get(VOICE_ID_KEY); } catch { return null; } });
  useEffect(() => { let live = true; void installedVoices().then(v => { if (live) setList(englishVoices(v).slice(0, 12)); }); return () => { live = false; }; }, []);
  const pick = (id: string | null) => { chooseVoice(id); setSaved(id); sayNow(SAMPLE); };
  const now = list ? currentVoice() : undefined;
  return (
    <View style={styles.wrap} testID={testID}>
      <Body size={14} weight="700">{now ? `Speaking with ${voiceLabel(now)}` : list ? 'The iPad’s default voice' : 'Looking at the installed voices…'}</Body>
      <View style={styles.chips}>
        <Button size="small" label="Best installed" tone={saved ? 'white' : 'pop'} onPress={() => pick(null)} testID={`${testID}-auto`}
          accessibilityLabel={`Best installed voice${saved ? '' : ', selected'}`} />
        {(list ?? []).map(v => (
          <Button key={v.identifier} size="small" label={voiceLabel(v)} tone={saved === v.identifier ? 'pop' : 'white'} onPress={() => pick(v.identifier)}
            testID={`${testID}-${v.identifier}`} accessibilityLabel={`${voiceLabel(v)}${saved === v.identifier ? ', selected' : ''}`} />
        ))}
      </View>
      <Body size={13} color={color.muted}>{VOICE_HELP}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingVertical: 6, flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
