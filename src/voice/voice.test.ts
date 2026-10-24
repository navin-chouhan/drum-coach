import { describe, expect, it } from 'vitest';
import { onsetOf } from './voice';

// A fake clip: 50 ms silence, 60 ms of quiet "s" hiss, then a loud vowel.
const sr = 8000;
const x = new Float32Array(sr / 2);
for (let i = 0; i < x.length; i++) {
  const t = i / sr;
  x[i] = t < 0.05 ? 0 : t < 0.11 ? 0.1 * Math.sin(i * 2.1) : 0.8 * Math.sin(i * 0.3);
}
const buf = { sampleRate: sr, getChannelData: () => x } as unknown as AudioBuffer;

describe('onsetOf', () => {
  it('lands on the vowel, not the hiss before it', () => {
    expect(onsetOf(buf)).toBeCloseTo(0.11, 2);
  });
});
