// AudioWorklet: RMS level of each input channel (kick / snare / hi-hat bands, filtered upstream) every 256 samples.
// Posts batches of [frameStartTime, level0, level1, level2, ...] to the main thread. Nothing is stored.
class BandLevels extends AudioWorkletProcessor {
  constructor() {
    super();
    this.N = 256; this.acc = new Float64Array(3); this.count = 0; this.start = 0; this.buf = new Float64Array(4 * 12); this.len = 0; // reused: no garbage on the audio thread
  }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const n = inp[0].length;
    for (let i = 0; i < n; i++) {
      if (this.count === 0) this.start = currentTime + i / sampleRate;
      for (let c = 0; c < 3; c++) { const x = (inp[c] ?? inp[0])[i]; this.acc[c] += x * x; }
      if (++this.count === this.N) {
        const b = this.buf, a = this.acc;
        b[this.len++] = this.start; for (let c = 0; c < 3; c++) b[this.len++] = Math.sqrt(a[c] / this.N);
        a.fill(0); this.count = 0;
        if (this.len === b.length) { this.port.postMessage(b); this.len = 0; } // postMessage copies it
      }
    }
    return true;
  }
}
registerProcessor('band-levels', BandLevels);
