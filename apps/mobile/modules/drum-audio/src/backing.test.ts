import { describe, expect, it } from 'vitest';

import {
  anchorFromRender, backingDriftMs, backingFilePath, clampRate, earliestHeardMs, expectedFileMs, expectedHeardMs,
  isUnityRate, LATE_JOIN_MARGIN_MS, nodeSampleForHost, planBackingStart, reanchorRequest, renderHostMs, smoothDrift,
  summarizeDrift, type BackingTiming,
} from './backing';

// The iPad speaker (GATE0 §9): 5.7 ms output latency (branch A heard offset), 21.3 ms IO buffer, safety 10.
const speaker: BackingTiming = { heardOffsetMs: 5.7, ioBufferMs: 21.3, safetyMs: 10, pitchLatencyMs: 0 };
const now = 1e9;
const file441 = { sampleRate: 44_100, frames: 44_100 * 360 }; // 6 minutes at 44.1 kHz

describe('rates', () => {
  it('clamps to 0.25..2; NaN and ≤ 0 mean 1', () => {
    expect([1, 0.5, 0.75, 0.1, 3, Number.NaN, 0, -1].map(clampRate)).toEqual([1, 0.5, 0.75, 0.25, 2, 1, 1, 1]);
    expect(isUnityRate(1)).toBe(true);
    expect(isUnityRate(1 + 1e-7)).toBe(true);
    expect(isUnityRate(0.999)).toBe(false);
  });
});

describe('planBackingStart', () => {
  it('on time: the frame of offsetMs, heard at `at`, entering the engine heardOffset earlier', () => {
    const p = planBackingStart({ at: now + 2000, offsetMs: 1000, rate: 1 }, now, speaker, file441)!;
    expect(p.startFrame).toBe(44_100);
    expect(p.fileStartMs).toBe(1000);
    expect(p.heardAtMs).toBe(now + 2000);
    expect(p.scheduleMs).toBeCloseTo(now + 2000 - 5.7, 9);
    expect(p.frameCount).toBe(file441.frames - 44_100);
    expect(p.joinedLateMs).toBe(0);
  });

  it('rounds the first frame up and keeps the heard time on the line (sub-frame exact)', () => {
    const req = { at: now + 1000, offsetMs: 10.01, rate: 0.5 };
    const p = planBackingStart(req, now, { ...speaker, pitchLatencyMs: 46.4 }, file441)!;
    expect(p.startFrame).toBe(442); // 10.01 ms × 44.1 = 441.44 → 442
    expect(p.fileStartMs).toBeCloseTo(442 / 44.1, 9);
    expect(p.heardAtMs).toBeCloseTo(expectedHeardMs(req, p.fileStartMs), 9);
    expect(p.heardAtMs - (now + 1000)).toBeCloseTo((442 / 44.1 - 10.01) / 0.5, 6); // 1e9 ms resolves ~1e-7
    expect(p.scheduleMs).toBeCloseTo(p.heardAtMs - 5.7 - 46.4, 9);
  });

  it('an exact frame stays that frame (no float creep to the next one)', () => {
    const p = planBackingStart({ at: now + 1000, offsetMs: 0.1 * 3 * 1000, rate: 1 }, now, speaker, { sampleRate: 48_000, frames: 1e7 })!;
    expect(p.startFrame).toBe(14_400);
  });

  it('a negative offset starts the file at 0, (−offset / rate) later (the web lead)', () => {
    const p = planBackingStart({ at: now + 1000, offsetMs: -250, rate: 0.5 }, now, speaker, file441)!;
    expect(p.startFrame).toBe(0);
    expect(p.heardAtMs).toBeCloseTo(now + 1500, 9);
  });

  it('too close or past: joins late on the same line, at the earliest time + margin', () => {
    const req = { at: now + 10, offsetMs: 5000, rate: 0.75 };
    const p = planBackingStart(req, now, speaker, file441)!;
    const join = earliestHeardMs(now, speaker) + LATE_JOIN_MARGIN_MS;
    expect(p.joinedLateMs).toBeCloseTo(join - (now + 10), 9);
    expect(p.heardAtMs).toBeGreaterThanOrEqual(join - 1e-9);
    expect(p.heardAtMs - join).toBeLessThan(1000 / 44_100 / 0.75 + 1e-9); // within one file frame
    expect(p.heardAtMs).toBeCloseTo(expectedHeardMs(req, p.fileStartMs), 9);
    expect(p.scheduleMs).toBeGreaterThanOrEqual(now + speaker.ioBufferMs + speaker.safetyMs);
    // A start 3 s in the past: 3 s × 0.75 further into the file.
    const past = planBackingStart({ at: now - 3000, offsetMs: 0, rate: 0.75 }, now, speaker, file441)!;
    expect(past.fileStartMs).toBeCloseTo(expectedFileMs({ at: now - 3000, offsetMs: 0, rate: 0.75 }, past.heardAtMs), 6);
    expect(past.fileStartMs).toBeGreaterThan(2250);
  });

  it('exactly at the earliest time is on time', () => {
    const at = earliestHeardMs(now, speaker);
    expect(planBackingStart({ at, offsetMs: 0, rate: 1 }, now, speaker, file441)!.joinedLateMs).toBe(0);
  });

  it('null past the end, or for a malformed request or file', () => {
    expect(planBackingStart({ at: now + 1000, offsetMs: 360_000, rate: 1 }, now, speaker, file441)).toBeNull();
    expect(planBackingStart({ at: now - 400_000, offsetMs: 0, rate: 1 }, now, speaker, file441)).toBeNull();
    expect(planBackingStart({ at: Number.NaN, offsetMs: 0, rate: 1 }, now, speaker, file441)).toBeNull();
    expect(planBackingStart({ at: now + 1000, offsetMs: 0, rate: 1 }, now, speaker, { sampleRate: 0, frames: 10 })).toBeNull();
    expect(planBackingStart({ at: now + 1000, offsetMs: 0, rate: 1 }, now, speaker, { sampleRate: 48_000, frames: 0 })).toBeNull();
  });

  it('an invalid rate plays at 1', () => {
    expect(planBackingStart({ at: now + 1000, offsetMs: 0, rate: Number.NaN }, now, speaker, file441)!.rate).toBe(1);
  });
});

describe('renderHostMs', () => {
  it("prefers the player's own host time when it agrees with the output's", () => {
    expect(renderHostMs(now, now + 21.3, 21.3)).toBe(now);
    expect(renderHostMs(now, now + 47.5, 21.3)).toBe(now);
    expect(renderHostMs(now, now + 47.7, 21.3)).toBe(now + 47.7);
    expect(renderHostMs(now, null, 21.3)).toBe(now);
    expect(renderHostMs(null, now, 21.3)).toBe(now);
    expect(renderHostMs(0, now, 21.3)).toBe(now);
    expect(renderHostMs(null, null, 21.3)).toBeNull();
  });
});

describe('anchorFromRender', () => {
  const plan = { startFrame: 44_100, fileStartMs: 1000 };
  it('frames rendered → file ms; heard heardOffset + pitch latency after the cycle', () => {
    const a = anchorFromRender(plan, { playerSampleTime: 22_050, playerSampleRate: 44_100, hostMs: now }, { heardOffsetMs: 5.7, pitchLatencyMs: 2 }, file441.frames)!;
    expect(a.at).toBeCloseTo(now + 7.7, 9);
    expect(a.fileMs).toBeCloseTo(1500, 9);
  });
  it('null before the start, after the end, or with invalid times', () => {
    const t = { heardOffsetMs: 5.7, pitchLatencyMs: 0 };
    expect(anchorFromRender(plan, { playerSampleTime: -1, playerSampleRate: 44_100, hostMs: now }, t, file441.frames)).toBeNull();
    expect(anchorFromRender(plan, { playerSampleTime: file441.frames - 44_100, playerSampleRate: 44_100, hostMs: now }, t, file441.frames)).toBeNull();
    expect(anchorFromRender(plan, { playerSampleTime: 0, playerSampleRate: 0, hostMs: now }, t, file441.frames)).toBeNull();
    expect(anchorFromRender(plan, { playerSampleTime: 0, playerSampleRate: 44_100, hostMs: Number.NaN }, t, file441.frames)).toBeNull();
  });

  it('a plan started and read on a perfect clock has zero drift, at any rate', () => {
    for (const rate of [1, 0.75, 0.5]) {
      const t = { ...speaker, pitchLatencyMs: rate === 1 ? 0 : 46.4 };
      const req = { at: now + 1500, offsetMs: 12_345.6, rate };
      const p = planBackingStart(req, now, t, file441)!;
      // The player starts at scheduleMs; by host time h it has rendered (h − scheduleMs) × 44.1 × rate frames.
      for (const h of [p.scheduleMs, p.scheduleMs + 1000, p.scheduleMs + 60_000]) {
        const a = anchorFromRender(p, { playerSampleTime: ((h - p.scheduleMs) / 1000) * 44_100 * rate, playerSampleRate: 44_100, hostMs: h }, t, file441.frames)!;
        expect(Math.abs(backingDriftMs(req, a))).toBeLessThan(1e-6);
      }
    }
  });
});

describe('drift (AUDIO-DESIGN §6, T6-3 shape): the anchor shows a device clock off by ±100 ppm', () => {
  for (const ppm of [100, -100]) {
    it(`${ppm > 0 ? '+' : ''}${ppm} ppm over 5 minutes: raw drift = −ppm × t; the smoothed value tracks it within 1 ms`, () => {
      const req = { at: now + 1000, offsetMs: 0, rate: 1 };
      const p = planBackingStart(req, now, speaker, file441)!;
      let smoothed = 0;
      let worst = 0;
      for (let ms = 0; ms <= 300_000; ms += 100) {
        const h = p.scheduleMs + ms;
        // A device running fast renders more frames per host second: the file is AHEAD (heard earlier) → drift < 0.
        const frames = (ms / 1000) * 44_100 * (1 + ppm * 1e-6);
        const a = anchorFromRender(p, { playerSampleTime: frames, playerSampleRate: 44_100, hostMs: h }, speaker, file441.frames)!;
        const d = backingDriftMs(req, a);
        expect(d).toBeCloseTo(-ms * ppm * 1e-6, 6);
        smoothed = smoothDrift(smoothed, d);
        worst = Math.max(worst, Math.abs(smoothed - d));
      }
      expect(worst).toBeLessThan(1);
      expect(Math.abs(smoothed)).toBeCloseTo(30, 0); // 100 ppm × 300 s
    });
  }
});

describe('nodeSampleForHost', () => {
  it('extrapolates the node timeline at sampleRate × rate', () => {
    expect(nodeSampleForHost({ sampleTime: 1000, hostMs: now }, now + 1000, 44_100, 1)).toBe(45_100);
    expect(nodeSampleForHost({ sampleTime: 1000, hostMs: now }, now + 1000, 44_100, 0.5)).toBe(23_050);
    expect(nodeSampleForHost({ sampleTime: 1000, hostMs: now }, now + 200, 48_000, 0.75)).toBe(8200);
  });
});

describe('reanchorRequest', () => {
  it('restarts on the last anchor, else on the plan line', () => {
    const plan = { heardAtMs: now + 100, fileStartMs: 250, rate: 0.5 };
    expect(reanchorRequest({ at: now + 5000, fileMs: 2700 }, plan)).toEqual({ at: now + 5000, offsetMs: 2700, rate: 0.5 });
    expect(reanchorRequest(null, plan)).toEqual({ at: now + 100, offsetMs: 250, rate: 0.5 });
  });
  it('a restart after a heard-offset change lands on the same line (Bluetooth: 180 ms)', () => {
    const req = { at: now + 1000, offsetMs: 0, rate: 1 };
    const p = planBackingStart(req, now, speaker, file441)!;
    const later = now + 30_000;
    const bt = { ...speaker, heardOffsetMs: 180, ioBufferMs: 10.7 };
    const q = planBackingStart(reanchorRequest(null, p), later, bt, file441)!;
    expect(q.joinedLateMs).toBeGreaterThan(0);
    expect(q.heardAtMs).toBeCloseTo(expectedHeardMs(req, q.fileStartMs), 9);
    expect(q.scheduleMs).toBeCloseTo(q.heardAtMs - 180, 9);
  });
});

describe('backingFilePath (local files only: never YouTube or a stream)', () => {
  it('accepts file:// URIs and absolute paths', () => {
    expect(backingFilePath('file:///var/mobile/Containers/Data/Application/X/Documents/songs/a%20b.m4a')).toBe('/var/mobile/Containers/Data/Application/X/Documents/songs/a b.m4a');
    expect(backingFilePath('file://localhost/tmp/x.caf')).toBe('/tmp/x.caf');
    expect(backingFilePath('/tmp/x.wav')).toBe('/tmp/x.wav');
  });
  it('refuses everything else', () => {
    for (const u of ['https://www.youtube.com/watch?v=abc', 'http://192.168.1.2:8787/api/charts/x/audio', 'content://x', 'file://host/x', 'x.m4a', '', 'file:///bad%zz']) {
      expect(backingFilePath(u)).toBeNull();
    }
  });
});

describe('summarizeDrift', () => {
  it('empty', () => {
    expect(summarizeDrift([]).n).toBe(0);
  });
  it('slope per minute, min/max, last, the smoothed value', () => {
    const samples = Array.from({ length: 1201 }, (_, i) => ({ t: now + i * 100, driftMs: 0.5 + i * 100 * 1e-4 })); // 6 ms/min
    const s = summarizeDrift(samples);
    expect(s.n).toBe(1201);
    expect(s.slopeMsPerMin).toBeCloseTo(6, 9);
    expect(s.minMs).toBeCloseTo(0.5, 9);
    expect(s.maxMs).toBeCloseTo(12.5, 9);
    expect(s.lastMs).toBeCloseTo(12.5, 9);
    expect(s.spanS).toBeCloseTo(120, 9);
    expect(Math.abs(s.smoothedMs - 12.5)).toBeLessThan(0.1);
  });
});
