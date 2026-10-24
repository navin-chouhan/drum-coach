import { createOnsetDetector, type Onset } from '../engine/onsets';
import { audio } from '../play/audio';

/**
 * Live audio of the popup "song player" tab (Chrome tab capture, not played locally). It's played here,
 * optionally with the drums turned down, and can be analysed for drum hits. Nothing is recorded or stored.
 */
export class TabAudio {
  private dry: GainNode; private wet: GainNode;
  private duck: AudioWorkletNode; private low: BiquadFilterNode; private high: BiquadFilterNode;
  private stream: MediaStream; private source: MediaStreamAudioSourceNode;
  private constructor(stream: MediaStream, source: MediaStreamAudioSourceNode) {
    this.stream = stream; this.source = source;
    const ctx = source.context as AudioContext;
    this.dry = ctx.createGain(); this.wet = ctx.createGain();
    this.duck = new AudioWorkletNode(ctx, 'drum-reducer', { outputChannelCount: [2] });
    this.low = ctx.createBiquadFilter(); this.low.type = 'lowshelf'; this.low.frequency.value = 100;
    this.high = ctx.createBiquadFilter(); this.high.type = 'highshelf'; this.high.frequency.value = 7000;
    source.connect(this.dry).connect(ctx.destination);
    source.connect(this.duck).connect(this.low).connect(this.high).connect(this.wet).connect(ctx.destination);
    this.setReduce(false, 0.7);
  }

  static async connect(onEnded: () => void): Promise<TabAudio> {
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
    await Promise.all([ctx.audioWorklet.addModule('/drum-reducer.js'), ctx.audioWorklet.addModule('/band-levels.js')]);
    return new TabAudio(stream, ctx.createMediaStreamSource(stream));
  }

  /** Drums down (strength 0–1) or the plain song. */
  setReduce(on: boolean, strength: number) {
    this.dry.gain.value = on ? 0 : 1;
    this.wet.gain.value = on ? 1 : 0;
    this.duck.parameters.get('strength')!.value = strength;
    this.low.gain.value = -14 * strength;
    this.high.gain.value = -9 * strength;
  }

  /** Detects kick / snare / hi-hat hits; `onOnset` gets each with its performance.now() time. Returns stop(). */
  analyse(onOnset: (o: Onset & { perf: number }) => void): () => void {
    const ctx = this.source.context as AudioContext;
    return analyseNode(this.source, o => onOnset({ ...o, perf: performance.now() - (ctx.currentTime - o.time) * 1000 }));
  }

  stop() {
    [this.dry, this.wet, this.duck, this.low, this.high].forEach(n => n.disconnect());
    this.source.disconnect();
    this.stream.getTracks().forEach(t => t.stop());
  }
}

/**
 * Band filters → band-levels worklet → onset detector. Bands are steep (two 2nd-order stages) so a kick's
 * low end doesn't leak into the snare band: kick < 110 Hz, snare 700 Hz–5 kHz, hi-hat > 8.5 kHz.
 * Onset times are in the audio context's clock. The worklet module must already be loaded. Returns stop().
 */
export function analyseNode(source: AudioNode, onOnset: (o: Onset) => void): () => void {
  const ctx = source.context;
  const f = (type: BiquadFilterType, hz: number) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = hz; b.Q.value = 0.7; return b; };
  const chains = [[f('lowpass', 110), f('lowpass', 110)], [f('highpass', 700), f('highpass', 700), f('lowpass', 5000)], [f('highpass', 8500), f('highpass', 8500)]];
  chains.forEach(c => c.reduce((a, b) => (a.connect(b), b)));
  const filters = chains.flat();
  const merger = ctx.createChannelMerger(3);
  const levels = new AudioWorkletNode(ctx, 'band-levels', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 3, channelCountMode: 'explicit', channelInterpretation: 'discrete' });
  chains.forEach((c, i) => { source.connect(c[0]); c[c.length - 1].connect(merger, 0, i); });
  merger.connect(levels);
  const detect = createOnsetDetector(256 / ctx.sampleRate);
  levels.port.onmessage = (e: MessageEvent<number[]>) => {
    const d = e.data;
    for (let i = 0; i < d.length; i += 4) for (const o of detect([d[i + 1], d[i + 2], d[i + 3]], d[i])) onOnset(o);
  };
  return () => { levels.port.onmessage = null; filters.forEach(f => f.disconnect()); merger.disconnect(); };
}
