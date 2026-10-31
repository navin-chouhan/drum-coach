// The iPad's AudioPort (core/play/audioPort.ts) on the drum-audio native module (modules/drum-audio). The only owner
// of the audio session (AUDIO-DESIGN §3.6): don't add expo-audio, expo-av or expo-speech for playback.
// Off iOS, in Expo Go or without the module, `available` is false, every call is a no-op and start() rejects.
// The keeper (audioLifecycle.ts) starts the engine for play screens and suspends it after a minute of nothing (§3.4).
import { AppState } from 'react-native';
import { native } from '../../modules/drum-audio';
import { createAudioKeeper, withKeeper } from './audioLifecycle';
import { createAudioPort, type DrumAudioPort } from './audioCore';

const port = createAudioPort(native);
export const audioKeeper = createAudioKeeper({
  port,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: t => clearTimeout(t as ReturnType<typeof setTimeout>),
});
AppState.addEventListener('change', s => { if (s === 'active') audioKeeper.foreground(); });

export const audio: DrumAudioPort = withKeeper(port, audioKeeper);
export { busVolumes, type DrumAudioPort } from './audioCore';
