import { describe, expect, it } from 'vitest';
import { heatBad, LATENCY_PATH_IPAD, latencyLine, timingText } from './results';

describe('take details words and heat (web Results, iPad ResultsDetails)', () => {
  it('timing in words', () => {
    expect(timingText(4.9)).toBe('Right on the grid');
    expect(timingText(-4.9)).toBe('Right on the grid');
    expect(timingText(-12.4)).toBe('Rushing by 12 ms');
    expect(timingText(22.6)).toBe('Dragging by 23 ms');
  });

  it('heat: misses count 1.6×, 60 ms off counts 0.8, capped at 1; an empty cell is 0', () => {
    expect(heatBad({ total: 0, miss: 0, meanAbsOffset: 0 })).toBe(0);
    expect(heatBad({ total: 4, miss: 0, meanAbsOffset: 0 })).toBe(0);
    expect(heatBad({ total: 4, miss: 1, meanAbsOffset: 30 })).toBeCloseTo(0.25 * 1.6 + 0.5 * 0.8);
    expect(heatBad({ total: 4, miss: 4, meanAbsOffset: 120 })).toBe(1);
  });

  it('the latency line: every stroke off the same way by 40 ms or more, not in wait mode', () => {
    const late = Array.from({ length: 10 }, () => ({ offset: 60 }));
    const early = Array.from({ length: 10 }, () => ({ offset: -45 }));
    expect(latencyLine({ options: {}, results: late as never })).toBe(
      "Almost every stroke landed about 60 ms late. If it felt on time to you, it's probably the setup, not your hands: run the latency test under ⚙ Setup → Your kit.");
    expect(latencyLine({ options: {}, results: early as never })).toMatch(/^Almost every stroke landed about 45 ms early\./);
    expect(latencyLine({ options: { wait: true }, results: late as never })).toBeUndefined();
    expect(latencyLine({ options: {}, results: [] })).toBeUndefined();
    // the iPad names its own path to the test (QA4 m4)
    expect(latencyLine({ options: {}, results: late as never }, LATENCY_PATH_IPAD)).toMatch(/run the latency test under ⚙ Setup → Latency → Measure\.$/);
  });
});
