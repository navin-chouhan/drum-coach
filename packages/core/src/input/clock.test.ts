import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_MAP } from '../engine/kit.ts';
import { createHitBus, type Hit } from './hits.ts';
import { replayFixture, type MidiFixture } from './fixtures.ts';

// The core never reads a clock: web hits come on performance.now() (small numbers), iOS hits on mach host time in ms
// (~1e9 and up). Shifting every time by 1e9 ms must not change the score.
//
// What "the same" means, measured: every judgement, pad, velocity, extra and headline stat is identical. Offsets and
// hit times differ by < 1e-6 ms, because a double at 1e9 only holds ~1e-7 ms (that's the platform's clock, not the
// core). The per-slot heat map rounds its mean to 0.1 ms, and the fixtures' times sit on a 0.1 ms grid, so a mean
// exactly halfway (e.g. 10.05) can round either way: those may differ by one rounding step.
const IOS_HOST_MS = 1e9;
const fixtures = Object.values(import.meta.glob<MidiFixture>('./fixtures/*.json', { eager: true, import: 'default' }));

/** Every place two replays differ, beyond the float noise described above. */
function differences(a: unknown, b: unknown, path = ''): string[] {
  if (typeof a === 'number' && typeof b === 'number') {
    const tol = /heat\.\d+\.meanAbsOffset$/.test(path) ? 0.1 + 1e-9 : /\.(offset|off|time)$/.test(path) ? 1e-6 : 0;
    return Math.abs(a - b) <= tol || (Number.isNaN(a) && Number.isNaN(b)) ? [] : [`${path}: ${a} vs ${b}`];
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap(k => differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`));
  }
  return a === b ? [] : [`${path}: ${String(a)} vs ${String(b)}`];
}

describe('clock-agnostic input and scoring', () => {
  for (const f of fixtures) it(`${f.name}: the same score with every time shifted by 1e9 ms`, () => {
    const web = replayFixture(f, { zero: 5_000 }), ios = replayFixture(f, { zero: 5_000 + IOS_HOST_MS });
    expect(web.landed).toBeGreaterThan(0);
    expect(ios.landed).toBe(web.landed);
    expect(ios.results.map(r => r.judgement)).toEqual(web.results.map(r => r.judgement));
    expect(ios.extras.length).toBe(web.extras.length);
    expect(ios.stats.accuracy).toBe(web.stats.accuracy);
    expect(differences(web, ios)).toEqual([]);
  });

  it('the injected clock dates hits that come without a time, and the bounce filter works on it', () => {
    let now = IOS_HOST_MS + 123;
    const bus = createHitBus({ now: () => now, getNoteMap: () => DEFAULT_NOTE_MAP, getPadCal: () => ({}) });
    const got: Hit[] = [];
    const off = bus.onHit(h => got.push(h));
    bus.emitPad('snare', 90);
    now += 30; bus.emitPad('snare', 40); // a retrigger 30 ms later at 44 %: dropped
    now += 200; bus.emitNote(38, 80);
    off();
    expect(got.map(h => [h.time, h.velocity])).toEqual([[IOS_HOST_MS + 123, 90], [IOS_HOST_MS + 353, 80]]);
  });

  it('reset() forgets the bounce memory', () => {
    const bus = createHitBus({ now: () => IOS_HOST_MS, getNoteMap: () => DEFAULT_NOTE_MAP, getPadCal: () => ({}) });
    const got: number[] = [];
    const off = bus.onHit(h => got.push(h.velocity));
    bus.emitNote(38, 90, IOS_HOST_MS); bus.emitNote(38, 40, IOS_HOST_MS + 30); // dropped as a bounce
    bus.reset(); bus.emitNote(38, 40, IOS_HOST_MS + 40); // nothing to compare with: kept
    off();
    expect(got).toEqual([90, 40]);
  });
});
