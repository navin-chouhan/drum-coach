import { describe, expect, it } from 'vitest';
import { BIG_FILL, FILL, flourishEvents, playFlourish } from './flourish';

describe('the celebration flourish (web Celebration flourish)', () => {
  it('a fill from `at`, a bigger one for a rank up or an encore', () => {
    const e = flourishEvents(1000, false);
    expect(e).toHaveLength(FILL.length);
    expect(e[2]).toEqual({ kind: 'sound', at: 1240, sound: 'drum.tom1', gain: 110 / 127 });
    expect(flourishEvents(0, true).map(x => x.at).at(-1)).toBe(1200);
    expect(flourishEvents(0, true)).toHaveLength(BIG_FILL.length);
  });
  it('plays past the route lead, nothing without audio', () => {
    const got: number[] = [];
    const port = { available: true, clock: { now: () => 5000 }, route: () => ({ minLeadMs: 40 }), schedule: (ev: { at: number }[]) => { got.push(ev[0].at); } };
    playFlourish(port, false);
    playFlourish({ ...port, available: false }, true);
    expect(got).toEqual([5090]);
  });
});
