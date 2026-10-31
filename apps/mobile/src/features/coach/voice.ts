// The coach's voice on the iPad: the system voice through expo-speech (the web uses Piper from its server, else the
// browser's voice; src/voice/voice.ts). Sentences queue one after another, as the web's sayNext does; nothing is
// said while a take runs (the session checks), and hush() stops it when a take starts.
// One volume path (QA3 m4): every sentence reads "Coach voice volume" from the settings as it's said, so verdicts,
// live tips, the recap and "How it moves" all follow Setup → Sound levels.
import * as Speech from 'expo-speech';
import { audioKeeper } from '../../platform/audio';
import { getStorage } from '../../platform/storage';
import { readSettings } from '../../ui/appSettings';
import { speechVolume } from './voiceVolume';

const RATE = 1.05; // the web's browser voice rate

/** Says `text` after whatever the coach is already saying, at the "Coach voice volume" setting. */
export function sayNext(text: string) {
  // Speech counts as sound: the idle suspend (setActive(false)) must not cut the coach off mid-sentence.
  audioKeeper.activity();
  let volume = 1;
  try { volume = speechVolume(readSettings(getStorage().kv).voiceVolume); } catch { /* defaults */ }
  try { Speech.speak(text, { rate: RATE, volume }); } catch { /* no voice in this build: the words are on screen */ }
}

/** Says something now, cutting off what was being said. */
export function sayNow(text: string) {
  void Speech.stop().catch(() => {}).finally(() => sayNext(text));
}

/** A take is starting: whatever the coach was saying stops, so it can't talk over the count-in. */
export function hush() {
  void Speech.stop().catch(() => {});
}
