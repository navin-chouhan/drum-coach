import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadFixture, pace, summary, toSchedule } from './fixture-timing.mjs';

const repoFixture = name => fileURLToPath(new URL(`../../../src/input/fixtures/${name}.json`, import.meta.url));

describe('replay-fixture timing (the MIDI-out part is unverified here)', () => {
  it('loads the repo fixtures', () => {
    for (const n of ['emulated-ghost-groove', 'emulated-flam-taps']) {
      const f = loadFixture(repoFixture(n));
      expect(f.midi.length).toBeGreaterThan(10);
    }
  });

  it('rejects a file that is not a fixture', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fx-'));
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ midi: [[0, 300]] }));
    writeFileSync(join(dir, 'none.json'), JSON.stringify({ name: 'x' }));
    expect(() => loadFixture(join(dir, 'bad.json'))).toThrow(/midi\[0\]/);
    expect(() => loadFixture(join(dir, 'none.json'))).toThrow(/not a fixture/);
  });

  it('schedules from the first message, keeps order, scales by speed, can drop realtime', () => {
    const f = { midi: [[-515, 248], [-14.2, 153, 38, 33], [10.9, 153, 38, 87], [5.9, 248], [24.6, 153, 38, 0]] };
    const s = toSchedule(f, { leadMs: 1000 });
    expect(s.map(e => Math.round(e.atMs * 10) / 10)).toEqual([1000, 1500.8, 1520.9, 1525.9, 1539.6]);
    expect(s[1].bytes).toEqual([153, 38, 33]);
    expect(toSchedule(f, { leadMs: 0, speed: 2 }).at(-1).atMs).toBeCloseTo(269.8, 5);
    const noRt = toSchedule(f, { realtime: false, leadMs: 0 });
    expect(noRt).toHaveLength(3);
    expect(noRt[0].atMs).toBe(0);
    expect(() => toSchedule(f, { speed: 0 })).toThrow();
  });

  it('paces against absolute targets on a fake clock: no drift, sends in order', async () => {
    let now = 0;
    const sleep = async ms => { now += ms + 0.5; }; // every sleep overshoots by 0.5 ms
    const sent = [];
    const schedule = toSchedule(loadFixture(repoFixture('emulated-flam-taps')), { leadMs: 100 });
    // the spin loop needs the clock to move: advance it a little each read
    const ticking = () => (now += 0.01);
    const late = await pace(schedule, b => sent.push([now, ...b]), { clock: ticking, sleep });
    expect(sent).toHaveLength(schedule.length);
    expect(Math.max(...late)).toBeLessThan(0.6);
    const s = summary(late);
    expect(s.n).toBe(schedule.length);
    // the last send lands at its own target, not at the sum of the waits before it
    expect(sent.at(-1)[0]).toBeCloseTo(schedule.at(-1).atMs, 0);
  });
});
