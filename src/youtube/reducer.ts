import { audio } from '../play/audio';

/**
 * Experimental live drum reduction. Chrome captures the popup player tab's audio (not played locally),
 * we duck transients and cut the kick/hat bands, and play the result here. Nothing is recorded or stored.
 */
export type Reducer = { setStrength(s: number): void; stop(): void };

export async function startReducer(strength: number, onEnded: () => void): Promise<Reducer> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true, // Chrome requires video; we stop it right away
    audio: { suppressLocalAudioPlayback: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    selfBrowserSurface: 'exclude', surfaceSwitching: 'exclude', systemAudio: 'exclude',
  } as DisplayMediaStreamOptions);
  stream.getVideoTracks().forEach(t => t.stop());
  const track = stream.getAudioTracks()[0];
  if (!track) { stream.getTracks().forEach(t => t.stop()); throw new Error('No audio: pick the "Drum Coach – song player" tab and keep "Also share tab audio" on.'); }
  track.onended = onEnded;

  const ctx = audio();
  await ctx.audioWorklet.addModule('/drum-reducer.js');
  const src = ctx.createMediaStreamSource(stream);
  const duck = new AudioWorkletNode(ctx, 'drum-reducer', { outputChannelCount: [2] });
  const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 100;
  const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 7000;
  src.connect(duck).connect(low).connect(high).connect(ctx.destination);
  const apply = (s: number) => {
    duck.parameters.get('strength')!.value = s;
    low.gain.value = -14 * s;
    high.gain.value = -9 * s;
  };
  apply(strength);
  return {
    setStrength: apply,
    stop() { src.disconnect(); duck.disconnect(); low.disconnect(); high.disconnect(); stream.getTracks().forEach(t => t.stop()); },
  };
}
