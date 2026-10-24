import { describe, expect, it } from 'vitest';
import { consensus, createOnsetDetector, onsetsToNotes } from './onsets';

const FRAME = 256 / 48000;
/** Synthetic band levels: a steady bed plus decaying hits at given times per band. */
function render(seconds: number, hits: Record<number, number[]>, bed = [0.01, 0.01, 0.002]) {
  const frames: { levels: number[]; time: number }[] = [];
  for (let t = 0; t < seconds; t += FRAME) {
    frames.push({ time: t, levels: [0, 1, 2].map(b => bed[b] + (hits[b] ?? []).reduce((a, h) => a + (t >= h ? 0.5 * Math.exp(-(t - h) / 0.06) : 0), 0)) });
  }
  return frames;
}

describe('onset detector', () => {
  it('finds kick, snare and hi-hat hits close to where they are, nothing on the steady bed', () => {
    const kicks = [0.5, 1.5], snares = [1.0, 2.0], hats = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25];
    const detect = createOnsetDetector(FRAME);
    const found = render(2.6, { 0: kicks, 1: snares, 2: hats }).flatMap(f => detect(f.levels, f.time));
    const at = (band: string) => found.filter(o => o.band === band).map(o => o.time);
    for (const [band, want] of [['kick', kicks], ['snare', snares], ['hihat', hats]] as const) {
      expect(at(band)).toHaveLength(want.length);
      at(band).forEach((t, i) => expect(Math.abs(t - want[i])).toBeLessThan(0.012));
    }
  });
  it('ignores a slow swell (a pad or vocal getting louder)', () => {
    const detect = createOnsetDetector(FRAME);
    const found: unknown[] = [];
    for (let t = 0; t < 2; t += FRAME) found.push(...detect([0.01 + 0.2 * t, 0.01, 0.002], t));
    expect(found).toHaveLength(0);
  });
  it('rejects a short click in the snare band (a kick beater) and a fast-but-slow-building bass swell', () => {
    const detect = createOnsetDetector(FRAME);
    const found: { band: string }[] = [];
    for (let t = 0; t < 1.5; t += FRAME) {
      const click = t >= 0.3 && t < 0.3 + FRAME ? 0.5 : 0;               // one 5 ms click
      const swell = t >= 0.8 ? 0.1 + Math.min(1, (t - 0.8) / 0.1) * 0.3 : 0.1; // a playing bass moving to a louder note over 100 ms
      found.push(...detect([swell, 0.01 + click, 0.002], t));
    }
    expect(found).toEqual([]);
  });
  it('one hit = one onset (refractory), even with a ringing tail', () => {
    const detect = createOnsetDetector(FRAME);
    const found = render(1, { 1: [0.2] }).flatMap(f => detect(f.levels, f.time));
    expect(found.filter(o => o.band === 'snare')).toHaveLength(1);
  });
});

describe('suggestions', () => {
  it('quantizes onsets and keeps only notes heard in 2+ passes', () => {
    const p1 = onsetsToNotes([{ beat: 0.02, band: 'kick' }, { beat: 1.01, band: 'snare' }, { beat: 2.6, band: 'snare' }], 0, 4);
    const p2 = onsetsToNotes([{ beat: -0.01, band: 'kick' }, { beat: 0.98, band: 'snare' }, { beat: 3.3, band: 'hihat' }], 0, 4);
    expect(p1).toEqual([{ t: 0, drum: 'kick' }, { t: 1, drum: 'snare' }, { t: 2.5, drum: 'snare' }]);
    expect(consensus([p1, p2]).map(n => `${n.t}:${n.drum}`)).toEqual(['0:kick', '1:snare']);
    expect(consensus([p1])).toHaveLength(3); // a single pass shows everything (marked as 1 vote)
  });
});
