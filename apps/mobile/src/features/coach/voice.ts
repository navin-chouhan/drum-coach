// The coach's voice on the iPad: the system voice through expo-speech (the web uses Piper from its server, else the
// browser's voice; src/voice/voice.ts). Sentences queue one after another, as the web's sayNext does; nothing is
// said while a take runs (the session checks), and hush() stops it when a take starts.
// Each sentence first makes sure the app's audio session is up (drum-audio's .playback + mixWithOthers), holds it
// while it plays, and reads "Coach voice volume" as it's said (QA3 m4). Why: voiceCore.ts.
import * as Speech from 'expo-speech';
import { audio, audioKeeper } from '../../platform/audio';
import { getStorage } from '../../platform/storage';
import { readSettings } from '../../ui/appSettings';
import { createVoice } from './voiceCore';

const voice = createVoice({
  speak: (text, o) => Speech.speak(text, { ...o, useApplicationAudioSession: true }),
  stop: () => Speech.stop(),
  ready: () => (audio.available ? audio.start() : Promise.resolve()),
  hold: () => audioKeeper.hold(),
  volume: () => { try { return readSettings(getStorage().kv).voiceVolume; } catch { return undefined; } },
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: t => clearTimeout(t as ReturnType<typeof setTimeout>),
});

/** Says `text` after whatever the coach is already saying, at the "Coach voice volume" setting. */
export function sayNext(text: string) { void voice.sayNext(text); }

/** Says something now, cutting off what was being said. */
export function sayNow(text: string) { void voice.sayNow(text); }

/** A take is starting: whatever the coach was saying stops, so it can't talk over the count-in. */
export function hush() { void voice.stop(); }
