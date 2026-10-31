// The coach's voice on the iPad: the system voice through expo-speech (the web uses Piper from its server, else the
// browser's voice; src/voice/voice.ts). Sentences queue one after another, as the web's sayNext does; nothing is
// said while a take runs (the session checks), and hush() stops it when a take starts.
import * as Speech from 'expo-speech';
import { audioKeeper } from '../../platform/audio';

const RATE = 1.05; // the web's browser voice rate

let volume = 1;
/** The "Coach voice volume" setting (0.2–1.25; the system voice tops out at 1). */
export const setVoiceVolume = (v: number) => { volume = Math.max(0, Math.min(1, v)); };

/** Says `text` after whatever the coach is already saying. */
export function sayNext(text: string) {
  // Speech counts as sound: the idle suspend (setActive(false)) must not cut the coach off mid-sentence.
  audioKeeper.activity();
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
