// The coach's voice on the iPad: the system voice through expo-speech (the web uses Piper from its server, else the
// browser's voice; src/voice/voice.ts). Sentences queue one after another, as the web's sayNext does; nothing is
// said over a take but the short live tips, and hush() stops it when a take starts.
// Each sentence first makes sure the app's audio session is up (drum-audio's .playback + mixWithOthers, D6), holds it
// while it plays, and reads "Coach voice volume" as it's said (QA3 m4). Why: voiceCore.ts.
//
// Voice first (D10): screens call speakMoment(moment) at the moment (moments.ts says the words, or nothing, from the
// settings), and sayItAgain() repeats the last one (kit kick × 2 between takes, key G). The voice is the best English
// one installed on the iPad, or the one picked in Setup → Coach and voice (voicePick.ts).
import * as Speech from 'expo-speech';
import { audio, audioKeeper } from '../../platform/audio';
import { getStorage } from '../../platform/storage';
import { readSettings, writeSettings } from '../../ui/appSettings';
import { createRepeat, momentText, VOICE_FIRST_KEY, voiceFirstPatch, type Moment } from './moments';
import { createVoice } from './voiceCore';
import { pickVoice, VOICE_ID_KEY, type VoiceInfo } from './voicePick';

export type { Moment } from './moments';

// ---- the installed voices (read once, again after a pick) ----
let voices: VoiceInfo[] | null = null;
let loading: Promise<void> | null = null;
function loadVoices(): Promise<void> {
  loading ??= Speech.getAvailableVoicesAsync().then(v => { voices = v as VoiceInfo[]; }, () => { voices = []; });
  return loading;
}
const kvGet = (k: string) => { try { return getStorage().kv.get(k); } catch { return null; } };
/** The installed English voices (the picker's list); loads them the first time. */
export async function installedVoices(): Promise<VoiceInfo[]> { await loadVoices(); return voices ?? []; }
/** The voice in use: the saved pick when it's installed, else the best one. */
export function currentVoice(): VoiceInfo | undefined { return voices ? pickVoice(voices, kvGet(VOICE_ID_KEY)) : undefined; }
/** Setup → Coach and voice: speak with this one from now on (null: the best installed one again). */
export function chooseVoice(id: string | null) {
  try { if (id) getStorage().kv.set(VOICE_ID_KEY, id); else getStorage().kv.remove(VOICE_ID_KEY); } catch { /* memory-only store */ }
}

const voice = createVoice({
  speak: (text, o) => Speech.speak(text, { ...o, useApplicationAudioSession: true }),
  stop: () => Speech.stop(),
  ready: () => Promise.all([audio.available ? audio.start() : Promise.resolve(), loadVoices()]),
  hold: () => audioKeeper.hold(),
  volume: () => { try { return readSettings(getStorage().kv).voiceVolume; } catch { return undefined; } },
  voiceId: () => currentVoice()?.identifier,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: t => clearTimeout(t as ReturnType<typeof setTimeout>),
});

const repeat = createRepeat();
let playing = false;
/** A take is running (the coach's setCoachPlaying): only the live tips are said meanwhile. */
export function setVoicePlaying(on: boolean) { playing = on; }

/** Says `text` after whatever the coach is already saying, at the "Coach voice volume" setting. */
export function sayNext(text: string) { repeat.remember(text); void voice.sayNext(text); }

/** Says something now, cutting off what was being said. */
export function sayNow(text: string) { repeat.remember(text); void voice.sayNow(text); }

/** A take is starting: whatever the coach was saying stops, so it can't talk over the count-in. */
export function hush() { void voice.stop(); }

/**
 * Says what this moment calls for (moments.ts), or nothing: the voice off, tips on the screen only, or anything but
 * a tip during a take. A tip cuts off what came before it; everything else waits its turn. Never throws.
 */
export function speakMoment(m: Moment): void {
  try {
    const text = momentText(m, readSettings(getStorage().kv), playing);
    if (!text) return;
    if (m.kind === 'tip' || m.kind === 'take') sayNow(text); else sayNext(text);
  } catch { /* the words are on screen */ }
}

/** Kick × 2 between takes, key G: the last thing the coach said, again (nothing during a take). */
export function sayItAgain(): void {
  const t = repeat.last();
  if (t && !playing) void voice.sayNow(t);
}

/** Once per install: the old default "tips on the screen" becomes spoken tips (D10 voice first). */
export function applyVoiceFirst(): void {
  try {
    const kv = getStorage().kv, p = voiceFirstPatch(readSettings(kv), kv.get(VOICE_FIRST_KEY) === '1');
    if (!p) return;
    if (Object.keys(p).length) writeSettings(kv, p);
    kv.set(VOICE_FIRST_KEY, '1');
  } catch { /* defaults */ }
}
