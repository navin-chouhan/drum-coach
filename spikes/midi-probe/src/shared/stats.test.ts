import { describe, expect, it } from 'vitest';
import { Samples, summarize } from './stats';

describe('summarize', () => {
  it('null without samples', () => expect(summarize([])).toBeNull());

  it('min, median, p95 (nearest rank), max, mean', () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(summarize(xs)).toEqual({ n: 100, min: 1, median: 50.5, p95: 95, max: 100, mean: 50.5 });
    expect(summarize([3, 1, 2])).toMatchObject({ median: 2, p95: 3 });
  });

  it('Samples keeps only the last cap values and resets', () => {
    const s = new Samples(3);
    [1, 2, 3, 4, 5].forEach(x => s.add(x));
    expect(s.values).toEqual([3, 4, 5]);
    s.reset();
    expect(s.summary()).toBeNull();
  });
});
