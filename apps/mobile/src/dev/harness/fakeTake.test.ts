import { describe, expect, it } from 'vitest';
import { LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import { fakeFinishedTake } from './fakeTake';

describe('the harness\'s fake take', () => {
  it('finishes with hits, a few misses and some late strokes', async () => {
    const f = await fakeFinishedTake(LESSON_BY_ID['money-8ths'].steps[2].chart);
    expect(f.stats.total).toBeGreaterThan(20);
    expect(f.stats.miss).toBeGreaterThan(0);
    expect(f.stats.accuracy).toBeGreaterThan(50);
    expect(f.stats.accuracy).toBeLessThan(100);
  });
});
