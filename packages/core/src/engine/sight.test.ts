import { describe, expect, it } from 'vitest';
import { SIGHT_GRADES, sightCards } from './sight';

describe('sightCards', () => {
  it('makes different, readable cards for every grade', () => {
    for (const g of SIGHT_GRADES) {
      const n = g === 1 ? 4 : 8; // grade 1 has only a few quarter-note bars
      const cards = sightCards(g, n, 7);
      expect(cards).toHaveLength(n);
      expect(new Set(cards.map(c => JSON.stringify(c.lines))).size).toBe(n);
      for (const c of cards) {
        expect(c.lines.snare).toHaveLength(4 * c.spb);
        if (c.lines.kick) expect([...c.lines.kick].every((k, i) => k === '.' || c.lines.snare[i] === '.')).toBe(true);
      }
    }
  });
  it('is the same for the same seed', () => expect(sightCards(4, 5, 3)).toEqual(sightCards(4, 5, 3)));
});
