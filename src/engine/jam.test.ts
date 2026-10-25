import { describe, expect, it } from 'vitest';
import { freeBarStats } from './jam';

describe('freeBarStats', () => {
  // 60 BPM (1000 ms a beat), 4/4, a 2-bar section looped twice; bar 2 is free. Zero at 5000 ms.
  const take = { zero: 5000, beatMs: 1000, beatsPerBar: 4, fromBar: 1, sectionBars: 2 };
  const at = (beat: number, off = 0) => ({ time: 5000 + beat * 1000 + off, pad: 'snare' as const, velocity: 90 });
  it('scores only the hits in free bars, folded over repeats, against the 8th-note grid', () => {
    const hits = [at(0), at(1), at(4, 10), at(5.5, -10), at(6, 300), at(12, 20), at(8)]; // bars 1,1,2,2,2,4,3
    const r = freeBarStats(hits, [at(6, 300)], take, [2])!;
    expect(r.stats.hits).toBe(4); // beats 4, 5.5, 6 (bar 2) and 12 (bar 4 = bar 2 again)
    expect(r.stats.onGridPct).toBe(75); // +300 ms is 200 ms from the nearest 8th: off the grid
    expect(r.extras).toBe(1);
  });
  it('is null without free bars', () => expect(freeBarStats([at(0)], [], take, [])).toBeNull());
});
