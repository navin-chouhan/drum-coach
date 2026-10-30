// The iPad's AudioPort (core/play/audioPort.ts) on the drum-audio native module (modules/drum-audio). The only owner
// of the audio session (AUDIO-DESIGN §3.6): don't add expo-audio, expo-av or expo-speech for playback.
// Off iOS, in Expo Go or without the module, `available` is false, every call is a no-op and start() rejects.
import { native } from '../../modules/drum-audio';
import { createAudioPort } from './audioCore';

export const audio = createAudioPort(native);
export { busVolumes, type DrumAudioPort } from './audioCore';
