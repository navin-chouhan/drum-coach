import { describe, expect, it } from 'vitest';

import {
  anchorFromRender, anchorInSegments, backingDriftMs, backingFilePath, clampRate, earliestHeardMs, endFrameOf, expectedFileMs,
  expectedHeardMs, firstSegment, isUnityRate, LATE_JOIN_MARGIN_MS, nodeSampleForHost, planBackingQueue, planBackingStart,
  reanchorPlan, reanchorRequest, renderHostMs, smoothDrift, summarizeDrift, type BackingSegmentPlan, type BackingTiming,
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

describe('a start with a length (durationMs of the line, from offsetMs)', () => {
  it('ends at offsetMs + durationMs, to the nearest frame; a late join keeps that end', () => {
    const p = planBackingStart({ at: now + 1000, offsetMs: 1000, rate: 0.75, durationMs: 2400 }, now, speaker, file441)!;
    expect(p.startFrame).toBe(44_100);
    expect(p.frameCount).toBe(Math.round(3.4 * 44_100) - 44_100);
    const late = planBackingStart({ at: now - 500, offsetMs: 1000, rate: 0.75, durationMs: 2400 }, now, speaker, file441)!;
    expect(late.startFrame + late.frameCount).toBe(Math.round(3.4 * 44_100));
  });
  it('a negative offset counts its lead in the length; nothing left, or a length ≤ 0: null; no length or NaN: to the end', () => {
    const p = planBackingStart({ at: now + 1000, offsetMs: -300, rate: 1, durationMs: 2400 }, now, speaker, file441)!;
    expect(p.frameCount).toBe(Math.round(2.1 * 44_100));
    expect(planBackingStart({ at: now + 1000, offsetMs: 0, rate: 1, durationMs: 0 }, now, speaker, file441)).toBeNull();
    expect(planBackingStart({ at: now + 1000, offsetMs: -300, rate: 1, durationMs: 200 }, now, speaker, file441)).toBeNull();
    expect(planBackingStart({ at: now - 5000, offsetMs: 0, rate: 1, durationMs: 2000 }, now, speaker, file441)).toBeNull();
    expect(planBackingStart({ at: now + 1000, offsetMs: 0, rate: 1, durationMs: Number.NaN }, now, speaker, file441)!.frameCount).toBe(file441.frames);
    expect(endFrameOf(0, 1e9, 44_100, 1000)).toBe(1000); // never past the file
    expect(endFrameOf(0, undefined, 44_100, 1000)).toBe(1000);
    expect(endFrameOf(-500, 100, 44_100, 1000)).toBe(0); // never before the file
  });
});

describe('planBackingQueue (seamless loops)', () => {
  /** A section looped `n` times: start + queued segments, as core's take hands them over. */
  function loop(n: number, o: { rate: number; offsetMs: number; secFileMs: number; sampleRate?: number }) {
    const file = { sampleRate: o.sampleRate ?? 44_100, frames: (o.sampleRate ?? 44_100) * 600 };
    const at0 = now + 1000, sec = o.secFileMs / o.rate; // heard ms per repeat
    const p = planBackingStart({ at: at0, offsetMs: o.offsetMs, rate: o.rate, durationMs: o.secFileMs }, now, speaker, file)!;
    const segs: BackingSegmentPlan[] = [firstSegment(p)];
    const plans = [];
    for (let r = 1; r < n; r++) {
      const last = segs[segs.length - 1];
      const q = planBackingQueue({ at: at0 + r * sec, offsetMs: o.offsetMs, durationMs: o.secFileMs }, p, last.playerFrame + last.frameCount, now, speaker, file)!;
      segs.push(q);
      plans.push(q);
    }
    return { p, segs, plans, file, at0, sec };
  }

  for (const rate of [1, 0.75, 0.5]) {
    it(`at ${rate * 100} %: 200 repeats of 2.4 s, each exactly where the one before ends, on the line to a frame`, () => {
      const { segs, plans, at0, sec } = loop(200, { rate, offsetMs: 2650, secFileMs: 2400 });
      for (const [i, q] of plans.entries()) {
        const prev = segs[i];
        expect(q.playerFrame).toBe(prev.playerFrame + prev.frameCount); // no gap, no overlap
        expect(q.explicitTime).toBe(false);
        expect(q.skippedFrames).toBe(0);
        expect(q.startFrame).toBe(segs[0].startFrame); // the same stretch of the file each time
        expect(q.frameCount).toBe(segs[0].frameCount);
        expect(Math.abs(q.heardAtMs - (at0 + (i + 1) * sec))).toBeLessThan(1000 / 44_100 / rate); // within a frame of the line
      }
    });
  }

  it('48 kHz and an odd section length: rounding never opens a gap', () => {
    const { segs, plans, at0, sec } = loop(500, { rate: 0.75, offsetMs: 123.456, secFileMs: 1234.5678, sampleRate: 48_000 });
    plans.forEach((q, i) => {
      expect(q.playerFrame).toBe(segs[i].playerFrame + segs[i].frameCount);
      expect(Math.abs(q.skippedFrames)).toBeLessThanOrEqual(1); // the line is 59 259.25 frames per repeat: a frame now and then
      // never creeps: where this segment puts the section's start is on the line, to a frame and a half, all along
      const sectionStartHeard = q.heardAtMs - (q.fileStartMs - 123.456) / 0.75;
      expect(Math.abs(sectionStartHeard - (at0 + (i + 1) * sec))).toBeLessThan((1.5 * 1000) / 48_000 / 0.75);
    });
  });

  it('a negative offset: each repeat waits its lead, at an explicit player time', () => {
    const file = file441, at0 = now + 1000;
    const p = planBackingStart({ at: at0, offsetMs: -300, rate: 1, durationMs: 2400 }, now, speaker, file)!;
    const q = planBackingQueue({ at: at0 + 2400, offsetMs: -300, durationMs: 2400 }, p, p.frameCount, now, speaker, file)!;
    expect(q.explicitTime).toBe(true);
    expect(q.playerFrame).toBe(Math.round(2.4 * 44_100)); // 0.3 s of silence after the 2.1 s of file
    expect(q.startFrame).toBe(0);
    expect(q.heardAtMs).toBeCloseTo(at0 + 2700, 6);
  });

  it('an overlap skips into the file; a late queue joins later on the same line', () => {
    const at0 = now + 1000;
    const p = planBackingStart({ at: at0, offsetMs: 0, rate: 0.5, durationMs: 10_000 }, now, speaker, file441)!;
    const over = planBackingQueue({ at: at0 + 19_000, offsetMs: 5000, durationMs: 1000 }, p, p.frameCount, now, speaker, file441)!;
    expect(over.playerFrame).toBe(p.frameCount);
    expect(over.skippedFrames).toBe(Math.round(0.5 * 44_100)); // due 1 s heard (0.5 s of file) early
    expect(over.startFrame).toBe(5.5 * 44_100);
    expect(over.explicitTime).toBe(false);
    // queued after the previous segment ran out: it joins at the earliest time + margin, on the line
    const later = now + 30_000;
    const late = planBackingQueue({ at: at0 + 20_000, offsetMs: 0, durationMs: 60_000 }, p, p.frameCount, later, speaker, file441)!;
    expect(late.explicitTime).toBe(true);
    expect(late.heardAtMs).toBeGreaterThanOrEqual(earliestHeardMs(later, speaker) + LATE_JOIN_MARGIN_MS - 1e-6);
    expect(late.heardAtMs - (at0 + 20_000)).toBeCloseTo((late.fileStartMs - 0) / 0.5, 3);
    expect(late.skippedFrames).toBe(late.startFrame);
  });

  it('null when nothing of it is left, or for a malformed request or file', () => {
    const p = planBackingStart({ at: now + 1000, offsetMs: 0, rate: 1, durationMs: 1000 }, now, speaker, file441)!;
    const q = (req: { at: number; offsetMs: number; durationMs: number }, f = file441, prevEnd = p.frameCount) => planBackingQueue(req, p, prevEnd, now, speaker, f);
    expect(q({ at: now + 2000, offsetMs: 360_000, durationMs: 1000 })).toBeNull();
    expect(q({ at: now + 1500, offsetMs: 0, durationMs: 400 })).toBeNull(); // overlapped entirely
    expect(q({ at: now + 2000, offsetMs: 0, durationMs: Number.NaN })).toBeNull();
    expect(q({ at: now + 2000, offsetMs: 0, durationMs: 1000 }, { sampleRate: 0, frames: 10 })).toBeNull();
    expect(q({ at: now + 2000, offsetMs: 0, durationMs: 1000 }, { sampleRate: 44_100, frames: 0 })).toBeNull();
    expect(q({ at: now + 2000, offsetMs: 0, durationMs: 1000 }, file441, Number.NaN)).toBeNull();
  });
});

describe('anchorInSegments: the anchor is right across seams', () => {
  const t = { heardOffsetMs: 5.7, pitchLatencyMs: 0 };
  const segs = [
    { playerFrame: 0, startFrame: 44_100, frameCount: 44_100, fileStartMs: 1000 },
    { playerFrame: 44_100, startFrame: 44_100, frameCount: 44_100, fileStartMs: 1000 },
    { playerFrame: 100_000, startFrame: 0, frameCount: 1000, fileStartMs: 0 }, // after a gap
  ];
  const at = (s: number) => anchorInSegments(segs, { playerSampleTime: s, playerSampleRate: 44_100, hostMs: now }, t);
  it('maps the player timeline through the segment list', () => {
    expect(at(44_099)).toMatchObject({ segment: 0, fileMs: 1000 + 44_099 / 44.1 });
    expect(at(44_100)).toMatchObject({ segment: 1, fileMs: 1000 });
    expect(at(100_500)).toMatchObject({ segment: 2, fileMs: 500 / 44.1 });
    expect(at(0)!.at).toBeCloseTo(now + 5.7, 9);
  });
  it('null before the first, in a gap, after the last, or with invalid times', () => {
    expect(at(-1)).toBeNull();
    expect(at(90_000)).toBeNull();
    expect(at(101_000)).toBeNull();
    expect(anchorInSegments([], { playerSampleTime: 0, playerSampleRate: 44_100, hostMs: now }, t)).toBeNull();
    expect(anchorInSegments(segs, { playerSampleTime: 0, playerSampleRate: 0, hostMs: now }, t)).toBeNull();
  });
  it('a looped line read on a perfect clock has zero drift in every repeat, at any rate', () => {
    for (const rate of [1, 0.75]) {
      const tm = { ...speaker, pitchLatencyMs: rate === 1 ? 0 : 46.4 };
      const at0 = now + 1500, secFile = 2400, sec = secFile / rate;
      const p = planBackingStart({ at: at0, offsetMs: 2650, rate, durationMs: secFile }, now, tm, file441)!;
      const segs2: BackingSegmentPlan[] = [firstSegment(p)];
      for (let r = 1; r < 50; r++) {
        const last = segs2[r - 1];
        segs2.push(planBackingQueue({ at: at0 + r * sec, offsetMs: 2650, durationMs: secFile }, p, last.playerFrame + last.frameCount, now, tm, file441)!);
      }
      for (let ms = 0; ms < 49 * sec; ms += 337) {
        const h = p.scheduleMs + ms, a = anchorInSegments(segs2, { playerSampleTime: (ms / 1000) * 44_100 * rate, playerSampleRate: 44_100, hostMs: h }, tm)!;
        const r = a.segment, line = { at: at0 + r * sec, offsetMs: 2650, rate };
        expect(Math.abs(backingDriftMs(line, a))).toBeLessThan(1000 / 44_100 / rate); // within a frame
      }
    }
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

describe('reanchorPlan', () => {
  const segs: BackingSegmentPlan[] = [
    { playerFrame: 0, startFrame: 44_100, frameCount: 44_100, fileStartMs: 1000, heardAtMs: now + 100 },
    { playerFrame: 44_100, startFrame: 44_100, frameCount: 44_100, fileStartMs: 1000, heardAtMs: now + 2100 },
    { playerFrame: 88_200, startFrame: 44_100, frameCount: 44_100, fileStartMs: 1000, heardAtMs: now + 4100 },
  ];
  it('from the last anchor to the end of its segment, then the later segments moved by the same drift', () => {
    // segment 1, file 1500 ms: on the line at now + 2100 + 500 / 0.5 = now + 3100; read 3 ms late
    const plan = reanchorPlan({ at: now + 3103, fileMs: 1500, segment: 1 }, segs, 0.5, 44_100)!;
    expect(plan.start).toEqual({ at: now + 3103, offsetMs: 1500, rate: 0.5, durationMs: 500 });
    expect(plan.queue).toHaveLength(1);
    expect(plan.queue[0].at).toBeCloseTo(now + 4103, 9);
    expect(plan.queue[0]).toMatchObject({ offsetMs: 1000, durationMs: 1000 });
  });
  it('no anchor: the first segment unmoved; bad input: null', () => {
    const plan = reanchorPlan(null, segs, 0.5, 44_100)!;
    expect(plan.start).toEqual({ at: now + 100, offsetMs: 1000, rate: 0.5, durationMs: 1000 });
    expect(plan.queue.map(q => q.at)).toEqual([now + 2100, now + 4100]);
    expect(reanchorPlan({ at: now, fileMs: 0, segment: 3 }, segs, 0.5, 44_100)).toBeNull();
    expect(reanchorPlan(null, [], 1, 44_100)).toBeNull();
    expect(reanchorPlan(null, segs, 1, 0)).toBeNull();
  });
  it('put back after a heard-offset change, the queued segments still follow back to back', () => {
    const at0 = now + 1000;
    const p = planBackingStart({ at: at0, offsetMs: 0, rate: 1, durationMs: 2000 }, now, speaker, file441)!;
    const s0 = firstSegment(p), s1 = planBackingQueue({ at: at0 + 2000, offsetMs: 0, durationMs: 2000 }, p, p.frameCount, now, speaker, file441)!;
    const later = now + 1500, bt = { ...speaker, heardOffsetMs: 180, ioBufferMs: 10.7 };
    const plan = reanchorPlan({ at: at0 + 500, fileMs: 500, segment: 0 }, [s0, s1], 1, 44_100)!;
    const q = planBackingStart(plan.start, later, bt, file441)!;
    expect(q.joinedLateMs).toBeGreaterThan(0);
    expect(q.startFrame + q.frameCount).toBe(2 * 44_100);
    const r = planBackingQueue(plan.queue[0], q, q.frameCount, later, bt, file441)!;
    expect(r.playerFrame).toBe(q.frameCount);
    expect(r.explicitTime).toBe(false);
    expect(r.heardAtMs).toBeCloseTo(at0 + 2000, 3);
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
