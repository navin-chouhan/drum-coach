import type { PadId } from '../engine/kit';

// One shared AudioContext. Sounds ported from prototype/drum-stage.html.
let ctx: AudioContext | null = null;
let master: GainNode, voiceOut: GainNode, noiseBuf: AudioBuffer;

export function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    voiceOut = ctx.createGain(); voiceOut.gain.value = 1; voiceOut.connect(ctx.destination); // the coach's voice isn't ducked
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** AudioContext time (s) → performance.now() ms, accounting for output latency when the browser reports it. */
export function audioToPerf(t: number): number {
  const c = audio();
  const ts = c.getOutputTimestamp?.();
  if (ts?.performanceTime && ts.contextTime !== undefined) return ts.performanceTime + (t - ts.contextTime) * 1000;
  return performance.now() + (t - c.currentTime) * 1000;
}

const env = (g: GainNode, t: number, peak: number, decay: number) => {
  g.gain.setValueAtTime(Math.max(peak, 0.0002), t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
};
function noise(t: number, decay: number, peak: number, filters: [BiquadFilterType, number, number?][]) {
  const c = ctx!, src = c.createBufferSource(); src.buffer = noiseBuf;
  let node: AudioNode = src;
  for (const [type, freq, q] of filters) {
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    node.connect(f); node = f;
  }
  const g = c.createGain(); env(g, t, peak, decay);
  node.connect(g); g.connect(master);
  src.start(t); src.stop(t + decay + 0.05);
}
function tone(t: number, type: OscillatorType, f0: number, f1: number, sweep: number, decay: number, peak: number) {
  const c = ctx!, o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
  const g = c.createGain(); env(g, t, peak, decay);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + decay + 0.05);
}

/** Synth drum at audio time `at` (default: now). */
export function playDrum(pad: PadId, vel: number, at?: number) {
  const t = at ?? audio().currentTime + 0.002, v = vel / 127;
  switch (pad) {
    case 'kick': tone(t, 'sine', 160, 42, 0.11, 0.38, 1.1 * v); noise(t, 0.02, 0.25 * v, [['lowpass', 1500]]); break;
    case 'snare': noise(t, 0.2, 0.7 * v, [['highpass', 1100]]); tone(t, 'triangle', 220, 160, 0.05, 0.12, 0.45 * v); break;
    case 'tom1': tone(t, 'sine', 240, 150, 0.2, 0.45, 0.9 * v); break;
    case 'tom2': tone(t, 'sine', 185, 115, 0.22, 0.5, 0.9 * v); break;
    case 'floor': tone(t, 'sine', 125, 78, 0.25, 0.6, v); break;
    case 'hhPedal': noise(t, 0.04, 0.18 * v, [['highpass', 8000]]); break;
    case 'hhClosed': case 'hhOpen':
      noise(t, pad === 'hhOpen' ? 0.45 : 0.06, 0.38 * v, [['highpass', 7000], ['peaking', 10000, 1]]); break;
    case 'crash': noise(t, 1.6, 0.5 * v, [['highpass', 3500]]); break;
    case 'ride':
      noise(t, 0.9, 0.16 * v, [['highpass', 6000]]);
      [1, 1.48, 2.13].forEach(m => tone(t, 'square', 620 * m, 610 * m, 0.3, 0.5, 0.035 * v));
      break;
  }
}

/** Metronome click at audio time t. level 0 = bar, 1 = beat, 2 = subdivision. */
export function click(t: number, level: 0 | 1 | 2, volume = 1) {
  const c = audio(), o = c.createOscillator();
  o.type = 'sine'; o.frequency.value = [1600, 1050, 800][level];
  const g = c.createGain(); env(g, t, [0.5, 0.32, 0.14][level] * volume, 0.04);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.06);
}

export function playBuffer(buf: AudioBuffer, when: number, offset: number, duration: number, rate: number) {
  const src = audio().createBufferSource();
  src.buffer = buf; src.playbackRate.value = rate; src.connect(master);
  src.start(when, offset, duration);
  return src;
}

/** The coach's voice at audio time `when`; clicks and synth drums dip while it talks. */
export function playVoice(buf: AudioBuffer, when = audio().currentTime) {
  const c = audio(), src = c.createBufferSource();
  src.buffer = buf; src.connect(voiceOut); src.start(when);
  master.gain.setTargetAtTime(0.35, when, 0.03);
  master.gain.setTargetAtTime(0.8, when + buf.duration, 0.1);
  return when + buf.duration;
}
