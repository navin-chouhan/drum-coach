import { describe, expect, it } from 'vitest';
import { replayFixture, type MidiFixture } from './fixtures';

// Every recorded session in src/input/fixtures/ must still give its result (N11).
const fixtures = Object.values(import.meta.glob<MidiFixture>('./fixtures/*.json', { eager: true, import: 'default' }));

describe('recorded kit sessions (fixtures)', () => {
  it('there is at least one', () => expect(fixtures.length).toBeGreaterThan(0));
  for (const f of fixtures) it(`${f.name} (${f.source}): ${f.note}`, () => {
    const r = replayFixture(f);
    if (f.expect.minLanded !== undefined) expect(r.landed).toBeGreaterThanOrEqual(f.expect.minLanded);
    if (f.expect.maxExtras !== undefined) expect(r.extras.length).toBeLessThanOrEqual(f.expect.maxExtras);
    if (f.expect.minAccuracy !== undefined) expect(r.stats.accuracy).toBeGreaterThanOrEqual(f.expect.minAccuracy);
  });
});
