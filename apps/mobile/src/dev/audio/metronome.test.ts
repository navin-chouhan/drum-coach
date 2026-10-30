import { describe, expect, it } from 'vitest';

import type { AudioEvent, AudioRoute } from '@drum-coach/core/play/audioPort';
import { clickAt, createMetronome, planClicks } from './metronome';

const route: AudioRoute = {
  key: 'Speaker', kind: 'speaker', name: 'Speaker', outputLatencyMs: 5.7, ioBufferMs: 21.3, sampleRate: 48000, heardOffsetMs: 5.7, minLeadMs: 37,
};

function fakePort() {
  const handed: { now: number; events: AudioEvent[] }[] = [];
  let cancels = 0;
  let now = 0;
  return {
    port: {
      schedule: (events: AudioEvent[]) => {
        handed.push({ now, events });
        return { accepted: events.length, late: 0 };
      },
      cancel: () => void cancels++,
      route: () => route,
    },
    handed,
    setNow: (t: number) => void (now = t),
    cancels: () => cancels,
  };
}

describe('clickAt / planClicks', () => {
  it('4/4 in eighths: bar, sub, beat, sub, …; times by multiplication', () => {
    const spec = { bpm: 120, beatsPerBar: 4, subdivision: 2 as const };
    expect(planClicks(spec, 1e9, 0, 9).map(e => (e.kind === 'sound' ? e.sound : ''))).toEqual([
      'click.bar', 'click.sub', 'click.beat', 'click.sub', 'click.beat', 'click.sub', 'click.beat', 'click.sub', 'click.bar',
    ]);
    expect(clickAt(spec, 1e9, 8).at).toBe(1e9 + 2000);
    // 5 minutes of 16ths at 133 BPM: no accumulated error
    const s16 = { bpm: 133, beatsPerBar: 4, subdivision: 4 as const };
    const k = 133 * 5 * 4;
    expect(clickAt(s16, 1e9, k).at - 1e9).toBeCloseTo(300_000, 6);
  });
});

describe('createMetronome', () => {
  it('starts max(300, minLead + 100) ahead and hands every click over once, ≥ 2 s ahead, in order', () => {
    const f = fakePort();
    const spec = { bpm: 120, beatsPerBar: 4, subdivision: 1 as const };
    const m = createMetronome(f.port, spec);
    const t0 = 1e9;
    f.setNow(t0);
    m.start(t0);
    expect(m.zero).toBe(t0 + 300);
    // ticks at irregular 5–400 ms intervals (a JS thread with stalls) for 5 minutes
    let t = t0;
    let seed = 7;
    while (t < t0 + 300_000) {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      t += 5 + (seed % 396);
      f.setNow(t);
      m.tick(t);
    }
    const all = f.handed.flatMap(h => h.events.map(e => ({ at: e.at, handedAt: h.now })));
    const ats = all.map(e => e.at);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
    expect(new Set(ats).size).toBe(ats.length);
    ats.forEach((at, k) => expect(at).toBeCloseTo(t0 + 300 + k * 500, 6));
    // every chunk after the first was handed with ≥ 2 s − one tick gap (400 ms) of lead
    for (const h of f.handed.slice(1)) expect(h.events[0].at - h.now).toBeGreaterThanOrEqual(2000 - 400);
    expect(m.stats.handed).toBe(ats.length);
    m.stop();
    m.stop();
    expect(f.cancels()).toBe(1);
  });

  it('a long route lead (Bluetooth) moves zero out', () => {
    const f = fakePort();
    const port = { ...f.port, route: () => ({ ...route, minLeadMs: 260 }) };
    const m = createMetronome(port, { bpm: 100, beatsPerBar: 4, subdivision: 1 });
    m.start(1e9);
    expect(m.zero).toBe(1e9 + 360);
  });
});
