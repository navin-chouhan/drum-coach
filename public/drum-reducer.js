// AudioWorklet: ducks fast transients (drum hits) using a fast vs slow envelope, with ~3 ms look-ahead.
class DrumReducer extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'strength', defaultValue: 0.7, minValue: 0, maxValue: 1 }]; }
  constructor() {
    super();
    this.fast = 0; this.slow = 0; this.gain = 1;
    this.look = Math.round(sampleRate * 0.003);
    this.buf = [new Float32Array(this.look + 1), new Float32Array(this.look + 1)];
    this.pos = 0;
    const k = s => Math.exp(-1 / (s * sampleRate));
    this.c = { fa: k(0.0005), fr: k(0.02), sa: k(0.03), sr: k(0.25), ga: k(0.0005), gr: k(0.05) };
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) return true;
    const st = params.strength[0], c = this.c, n = inp[0].length;
    for (let i = 0; i < n; i++) {
      let x = 0;
      for (const ch of inp) x = Math.max(x, Math.abs(ch[i]));
      this.fast = x > this.fast ? c.fa * this.fast + (1 - c.fa) * x : c.fr * this.fast + (1 - c.fr) * x;
      this.slow = x > this.slow ? c.sa * this.slow + (1 - c.sa) * x : c.sr * this.slow + (1 - c.sr) * x;
      const ratio = this.fast / (this.slow + 1e-6);
      const target = ratio > 1.3 ? Math.max(1 - st, 1 / (1 + st * 3 * (ratio - 1.3))) : 1;
      this.gain = target < this.gain ? c.ga * this.gain + (1 - c.ga) * target : c.gr * this.gain + (1 - c.gr) * target;
      for (let ch = 0; ch < out.length; ch++) {
        const src = inp[ch] ?? inp[0], b = this.buf[ch] ?? this.buf[0];
        const delayed = b[this.pos];
        b[this.pos] = src[i];
        out[ch][i] = delayed * this.gain;
      }
      this.pos = (this.pos + 1) % (this.look + 1);
    }
    return true;
  }
}
registerProcessor('drum-reducer', DrumReducer);
