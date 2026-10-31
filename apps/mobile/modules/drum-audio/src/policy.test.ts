import { describe, expect, it } from 'vitest';

import {
  defaultLoopPolicy, duckStep, gainStep, HEARD_OFFSET_BRANCH, heardOffsetMs, isDue, isLate, minLeadMs, pickVoice, POOLS,
  routeChangeEndsTake, routeKey, routeKind, sameRoute, scheduleTimeMs, stepGain,
} from './policy';

// ios/Core/Tests/DrumAudioCoreTests/AudioPolicyTests.swift runs the same vectors against the Swift mirror.

describe('loop parameters', () => {
  it('are the design values: 10 ms tick, 120 ms window, 10 ms safety', () => {
    expect(defaultLoopPolicy).toEqual({ tickMs: 10, windowMs: 120, safetyMs: 10, maxPending: 20_000 });
  });
  it('the window is far longer than the 21.3 ms IO buffer seen on the iPad plus a tick', () => {
    expect(defaultLoopPolicy.windowMs).toBeGreaterThan(21.3 + defaultLoopPolicy.safetyMs + 2 * defaultLoopPolicy.tickMs);
  });
});

describe('heardOffsetMs (M5 branch)', () => {
  it('branch A is the default: heard = scheduled + outputLatency', () => {
    expect(HEARD_OFFSET_BRANCH).toBe('A');
    expect(heardOffsetMs(5.7, 21.3)).toBe(5.7);
  });
  it('branch B: 0; branch A′: outputLatency + IO buffer', () => {
    expect(heardOffsetMs(5.7, 21.3, 'B')).toBe(0);
    expect(heardOffsetMs(5.7, 21.3, 'A2')).toBeCloseTo(27, 9);
  });
});

describe('route → minLeadMs', () => {
  // [ioBufferMs, outputLatencyMs, minLead under branch A]
  const vectors: [number, number, number][] = [
    [21.3, 5.7, 37], // the iPad's speaker as seen in Gate 0
    [5.3, 5.7, 21], // if the 5 ms buffer is granted
    [10.7, 180, 200.7], // Bluetooth headphones
  ];
  for (const [io, out, lead] of vectors) {
    it(`io ${io} + out ${out} → ${lead}`, () => expect(minLeadMs(io, heardOffsetMs(out, io))).toBeCloseTo(lead, 9));
  }
});

describe('late rule and window', () => {
  const io = 21.3; // now = 1e9 (host ms), so the threshold is 1e9 + 31.3 in schedule time
  const now = 1e9;
  it('an event exactly at now + minLead is on time; just before it is late', () => {
    const lead = minLeadMs(io, 5.7);
    expect(isLate(scheduleTimeMs(now + lead, 5.7, 0), now, io)).toBe(false);
    expect(isLate(scheduleTimeMs(now + lead - 0.001, 5.7, 0), now, io)).toBe(true);
  });
  it("a word's onset moves its schedule time earlier", () => {
    expect(scheduleTimeMs(now + 200, 5.7, 120)).toBeCloseTo(now + 74.3, 6);
    expect(isLate(scheduleTimeMs(now + 150, 5.7, 120), now, io)).toBe(true);
  });
  it('due = schedule time before now + 120', () => {
    expect(isDue(now + 119.999, now)).toBe(true);
    expect(isDue(now + 120, now)).toBe(false);
  });
});

describe('gainStep', () => {
  // [gain, stepsPerUnit, step]
  const vectors: [number, number, number][] = [
    [1, 16, 16], [0.75, 16, 12], [0.35, 16, 6], [1.5, 16, 24], [2, 16, 24], [-1, 16, 0], [NaN, 16, 0],
    [0.01, 16, 0], [0.04, 16, 1], [100 / 127, 8, 6], [1, 8, 8], [0.5, 8, 4], [0.06, 8, 0], [1.5, 8, 12],
  ];
  for (const [g, s, step] of vectors) it(`${g} at ${s}/unit → ${step}`, () => expect(gainStep(g, s)).toBe(step));
  it('steps are within half a step of the gain', () => {
    for (let g = 0; g <= 1.5; g += 0.01) expect(Math.abs(stepGain(gainStep(g, 16), 16) - g)).toBeLessThanOrEqual(1 / 32 + 1e-12);
  });
});

describe('pickVoice', () => {
  it('uses the lowest node whose last buffer has ended', () => {
    expect(pickVoice([100, 50, 0], 60, 4)).toEqual({ kind: 'use', index: 1 });
    expect(pickVoice([100, 50, 0], 100, 4)).toEqual({ kind: 'use', index: 0 }); // touching ends are fine
  });
  it('overlap → another node; none free → grow; at the cap → drop', () => {
    expect(pickVoice([100, 100], 99, 4)).toEqual({ kind: 'grow', index: 2 });
    expect(pickVoice([100, 100, 100, 100], 99, 4)).toEqual({ kind: 'drop' });
    expect(pickVoice([], 0, 1)).toEqual({ kind: 'grow', index: 0 });
  });
  it('two click nodes cover 16ths at 240 BPM (62.5 ms apart, 60 ms clicks)', () => {
    const busy = [0, 0];
    let t = 1e9;
    for (let k = 0; k < 64; k++, t += 62.5) {
      const p = pickVoice(busy, t, POOLS.click.cap);
      expect(p.kind).toBe('use');
      if (p.kind === 'use') busy[p.index] = t + 60;
    }
  });
  it('pool sizes are the design values', () => {
    expect(POOLS).toEqual({
      click: { initial: 2, cap: 4 }, drums: { initial: 12, cap: 24 }, band: { initial: 8, cap: 16 },
      voice: { initial: 2, cap: 4 }, backing: { initial: 1, cap: 1 },
    });
  });
});

describe('routes', () => {
  // [portType, uid, kind, key]
  const vectors: [string, string, string, string][] = [
    ['Speaker', 'Built-In Speaker', 'speaker', 'Speaker'],
    ['Headphones', 'Wired Headphones', 'wired', 'Headphones:Wired Headphones'],
    ['USBAudio', 'AppleUSBAudioEngine:Apple:USB-C to 3.5mm:1', 'usb', 'USBAudio:AppleUSBAudioEngine:Apple:USB-C to 3.5mm:1'],
    ['BluetoothA2DPOutput', 'AA:BB:CC:DD:EE:FF-tacl', 'bluetooth', 'BluetoothA2DPOutput:AA:BB:CC:DD:EE:FF-tacl'],
    ['BluetoothLE', 'X', 'bluetooth', 'BluetoothLE:X'],
    ['AirPlay', 'abc', 'airplay', 'AirPlay:abc'],
    ['HDMI', 'h', 'other', 'HDMI:h'],
    ['LineOut', '', 'wired', 'LineOut'],
  ];
  for (const [type, uid, kind, key] of vectors) {
    it(`${type} → ${kind}, ${key}`, () => {
      expect(routeKind(type)).toBe(kind);
      expect(routeKey(type, uid)).toBe(key);
    });
  }
  it('sameRoute ignores latency jitter under 0.5 ms, nothing else', () => {
    const a = { key: 'Speaker', sampleRate: 48000, ioBufferMs: 21.33, outputLatencyMs: 5.7 };
    expect(sameRoute(a, { ...a, outputLatencyMs: 5.9 })).toBe(true);
    expect(sameRoute(a, { ...a, outputLatencyMs: 6.3 })).toBe(false);
    expect(sameRoute(a, { ...a, sampleRate: 44100 })).toBe(false);
    expect(sameRoute(a, { ...a, ioBufferMs: 5.33 })).toBe(false);
    expect(sameRoute(a, { ...a, key: 'Headphones:x' })).toBe(false);
  });
  it('routeChangeEndsTake: a new route while running ends the take; jitter, a stopped engine or the first start do not', () => {
    const a = { key: 'Speaker', sampleRate: 48000, ioBufferMs: 21.33, outputLatencyMs: 5.7 };
    expect(routeChangeEndsTake(a, { ...a, key: 'USBAudio:hub' }, true)).toBe(true);
    expect(routeChangeEndsTake(a, { ...a, outputLatencyMs: 40 }, true)).toBe(true);
    expect(routeChangeEndsTake(a, { ...a, outputLatencyMs: 5.9 }, true)).toBe(false);
    expect(routeChangeEndsTake(a, { ...a, key: 'USBAudio:hub' }, false)).toBe(false);
    expect(routeChangeEndsTake(null, a, true)).toBe(false);
  });
});

describe('duckStep', () => {
  it('reaches 45 % in three 10 ms ticks and comes back the same way', () => {
    let v = 1;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) seen.push((v = duckStep(v, 0.45)));
    expect(seen.map(x => +x.toFixed(4))).toEqual([0.8167, 0.6333, 0.45, 0.45]);
    for (let i = 0; i < 3; i++) v = duckStep(v, 1);
    expect(v).toBeCloseTo(1, 12);
  });
});
