// AudioWorklet: RMS level of each input channel (kick / snare / hi-hat bands, filtered upstream) every 256 samples.
// Posts batches of [frameStartTime, level0, level1, level2, ...] to the main thread. Nothing is stored.
class BandLevels extends AudioWorkletProcessor {
  constructor() {
    super();
    this.N = 256; this.acc = [0, 0, 0]; this.count = 0; this.start = 0; this.buf = [];
  }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const n = inp[0].length;
    for (let i = 0; i < n; i++) {
      if (this.count === 0) this.start = currentTime + i / sampleRate;
      for (let c = 0; c < 3; c++) { const x = (inp[c] ?? inp[0])[i]; this.acc[c] += x * x; }
      if (++this.count === this.N) {
        this.buf.push(this.start, Math.sqrt(this.acc[0] / this.N), Math.sqrt(this.acc[1] / this.N), Math.sqrt(this.acc[2] / this.N));
        this.acc = [0, 0, 0]; this.count = 0;
        if (this.buf.length >= 4 * 12) { this.port.postMessage(this.buf); this.buf = []; }
      }
    }
    return true;
  }
}
registerProcessor('band-levels', BandLevels);
