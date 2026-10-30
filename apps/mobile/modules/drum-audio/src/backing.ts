// Backing audio (BackingPort, core/play/audioPort.ts) as pure functions: where a local file starts, when its first
// frame must enter the engine, and what the render clock says is heard now (the anchor core corrects drift against,
// AUDIO-DESIGN §1.4 and §6). ios/Core/Sources/DrumAudioCore/BackingMath.swift is a line-by-line mirror: change both
// together; Tests/DrumAudioCoreTests/BackingMathTests.swift runs the same vectors as backing.test.ts.
//
// Only local files the owner imported play here (CLAUDE.md: YouTube audio is never played, streamed or stored).
//
// Times are Clock ms (mach host ms). The mapping a start asks for is a line: file position `offsetMs` is heard at `at`,
// and the file advances `rate` ms per Clock ms (AVAudioUnitTimePitch, pitch kept). Native keeps that line exactly:
//  - a negative offset (the song starts after beat 0) starts the file at 0, (−offset / rate) later (the web's `lead`);
//  - a start too close to place (or in the past) joins late: it skips into the file, so what is heard still sits on
//    the line, instead of playing late the way an AudioBufferSourceNode would;
//  - the first frame is rounded up, and the heard time is recomputed from it (sub-frame exact).

/** The rates native accepts (AVAudioUnitTimePitch takes 1/32…32; the app uses 0.5…1). NaN and ≤ 0 mean 1. */
export const BACKING_RATE = Object.freeze({ min: 0.25, max: 2 });

/** Rates this close to 1 bypass the time-pitch unit (no added latency, plain host-time start). */
export const UNITY_RATE_EPS = 1e-6;

/** Extra room for a late join: the file's first frames are read (`prepare`) before `play(at:)`. */
export const LATE_JOIN_MARGIN_MS = 50;

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  return Math.min(Math.max(rate, BACKING_RATE.min), BACKING_RATE.max);
}

export function isUnityRate(rate: number): boolean {
  return Math.abs(rate - 1) < UNITY_RATE_EPS;
}

export type BackingTiming = {
  /** The route's heard offset (AudioRoute.heardOffsetMs): schedule time + heardOffsetMs = heard time. */
  heardOffsetMs: number;
  ioBufferMs: number;
  /** LoopPolicy.safetyMs. */
  safetyMs: number;
  /** AVAudioUnitTimePitch.latency × 1000 when it isn't bypassed, else 0. */
  pitchLatencyMs: number;
};

export type BackingStartRequest = { at: number; offsetMs: number; rate: number };

export type BackingPlan = {
  rate: number;
  /** First file frame of the segment (`scheduleSegment(startingFrame:)`). */
  startFrame: number;
  frameCount: number;
  /** startFrame in ms of the file. */
  fileStartMs: number;
  /** When startFrame is heard (Clock ms): on the requested line. */
  heardAtMs: number;
  /** When startFrame must enter the player (host ms, `play(at:)`): heardAtMs − heardOffsetMs − pitchLatencyMs. */
  scheduleMs: number;
  /** Clock ms of the line skipped because `at` was too close or past (0 = on time). */
  joinedLateMs: number;
};

/** Earliest heard time a start can still be placed exactly at `nowMs` (the late rule of AudioPolicy.isLate). */
export function earliestHeardMs(nowMs: number, t: BackingTiming): number {
  return nowMs + t.ioBufferMs + t.safetyMs + t.heardOffsetMs + t.pitchLatencyMs;
}

/**
 * The segment to schedule for a start request, or null when nothing of the file is left to play (or the request or
 * file is malformed). `marginMs` is added to the earliest time only when the start has to join late.
 */
export function planBackingStart(
  req: BackingStartRequest,
  nowMs: number,
  t: BackingTiming,
  file: { sampleRate: number; frames: number },
  marginMs = LATE_JOIN_MARGIN_MS,
): BackingPlan | null {
  const rate = clampRate(req.rate);
  if (![req.at, req.offsetMs, nowMs].every(Number.isFinite) || !(file.sampleRate > 0) || !(file.frames > 0)) return null;
  let at = req.at;
  let offset = req.offsetMs;
  if (offset < 0) {
    at += -offset / rate;
    offset = 0;
  }
  const earliest = earliestHeardMs(nowMs, t);
  let joinedLateMs = 0;
  if (at < earliest) {
    const join = earliest + marginMs;
    joinedLateMs = join - at;
    offset += joinedLateMs * rate;
    at = join;
  }
  const startFrame = Math.max(0, Math.ceil((offset * file.sampleRate) / 1000 - 1e-6));
  if (startFrame >= file.frames) return null;
  const fileStartMs = (startFrame * 1000) / file.sampleRate;
  const heardAtMs = at + (fileStartMs - offset) / rate;
  return {
    rate,
    startFrame,
    frameCount: file.frames - startFrame,
    fileStartMs,
    heardAtMs,
    scheduleMs: heardAtMs - t.heardOffsetMs - t.pitchLatencyMs,
    joinedLateMs,
  };
}

/** Where the requested line says file position `fileMs` is heard. */
export function expectedHeardMs(req: BackingStartRequest, fileMs: number): number {
  return req.at + (fileMs - req.offsetMs) / clampRate(req.rate);
}

/** Where the requested line says the file is at Clock time `heardMs`. */
export function expectedFileMs(req: BackingStartRequest, heardMs: number): number {
  return req.offsetMs + (heardMs - req.at) * clampRate(req.rate);
}

export type BackingAnchor = { at: number; fileMs: number };

/**
 * The host ms of the render cycle the player's last render belongs to: the player's own `lastRenderTime.hostTime`
 * when it is valid and agrees with the output node's (within two IO buffers + 5 ms); else the output node's; else null.
 * (Behind a time-pitch unit the player's host time is unverified, so it is checked against the output's.)
 */
export function renderHostMs(playerHostMs: number | null, outputHostMs: number | null, ioBufferMs: number): number | null {
  const ok = (x: number | null): x is number => x != null && Number.isFinite(x) && x > 0;
  if (ok(playerHostMs) && (!ok(outputHostMs) || Math.abs(playerHostMs - outputHostMs) <= 2 * ioBufferMs + 5)) return playerHostMs;
  return ok(outputHostMs) ? outputHostMs : null;
}

/**
 * The anchor from the render clock: `playerSampleTime` = `player.playerTime(forNodeTime: player.lastRenderTime)`
 * .sampleTime, the frames of the segment the player had rendered when that cycle began (negative before it starts).
 * Those frames enter the time-pitch unit at `hostMs` and are heard heardOffset + pitchLatency later. Null before the
 * segment starts, after it ends, or when the times aren't valid.
 */
export function anchorFromRender(
  plan: Pick<BackingPlan, 'startFrame' | 'fileStartMs'>,
  r: { playerSampleTime: number; playerSampleRate: number; hostMs: number },
  t: Pick<BackingTiming, 'heardOffsetMs' | 'pitchLatencyMs'>,
  fileFrames: number,
): BackingAnchor | null {
  if (!(r.playerSampleRate > 0) || !Number.isFinite(r.playerSampleTime) || !Number.isFinite(r.hostMs)) return null;
  if (r.playerSampleTime < 0) return null;
  if (plan.startFrame + r.playerSampleTime >= fileFrames) return null;
  return {
    at: r.hostMs + t.heardOffsetMs + t.pitchLatencyMs,
    fileMs: plan.fileStartMs + (r.playerSampleTime * 1000) / r.playerSampleRate,
  };
}

/**
 * Behind a time-pitch unit the player's node timeline runs at sampleRate × rate per real second, but AVFoundation
 * turns a host time into node time at sampleRate. So for rate ≠ 1 the start is given as a node sample time,
 * extrapolated from the player's last render at the speed it really runs.
 */
export function nodeSampleForHost(last: { sampleTime: number; hostMs: number }, targetHostMs: number, sampleRate: number, rate: number): number {
  return Math.round(last.sampleTime + ((targetHostMs - last.hostMs) / 1000) * sampleRate * clampRate(rate));
}

/**
 * After a route or engine change: the line to restart on. The last anchor read (what core has corrected against), or
 * the plan's own line before any anchor exists.
 */
export function reanchorRequest(last: BackingAnchor | null, plan: Pick<BackingPlan, 'heardAtMs' | 'fileStartMs' | 'rate'>): BackingStartRequest {
  return last ? { at: last.at, offsetMs: last.fileMs, rate: plan.rate } : { at: plan.heardAtMs, offsetMs: plan.fileStartMs, rate: plan.rate };
}

/** A local file to play: a file:// URI or an absolute path. Anything else (http, YouTube, content://) is refused. */
export function backingFilePath(uri: string): string | null {
  const s = uri.trim();
  if (s.startsWith('/')) return s;
  if (!/^file:\/\//i.test(s)) return null;
  const rest = s.slice('file://'.length);
  const path = rest.startsWith('/') ? rest : rest.replace(/^localhost(?=\/)/i, '');
  if (!path.startsWith('/')) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

/** drift = anchor.at − where the requested line puts anchor.fileMs (positive: the file is heard later than planned). */
export function backingDriftMs(req: BackingStartRequest, a: BackingAnchor): number {
  return a.at - expectedHeardMs(req, a.fileMs);
}

/** The web's smoothing (player.ts): factor 0.1; a reading of 50 ms or more is a stale timestamp, not drift. */
export function smoothDrift(previous: number, reading: number): number {
  return Math.abs(reading) < 50 ? previous + (reading - previous) * 0.1 : previous;
}

export type DriftSummary = {
  n: number;
  lastMs: number;
  smoothedMs: number;
  minMs: number;
  maxMs: number;
  /** Least-squares slope, ms of drift per minute of Clock time. */
  slopeMsPerMin: number;
  spanS: number;
};

/** The debug card's numbers from (Clock ms, drift ms) readings. */
export function summarizeDrift(samples: readonly { t: number; driftMs: number }[]): DriftSummary {
  const n = samples.length;
  if (n === 0) return { n: 0, lastMs: Number.NaN, smoothedMs: Number.NaN, minMs: Number.NaN, maxMs: Number.NaN, slopeMsPerMin: Number.NaN, spanS: 0 };
  let smoothed = 0, min = Infinity, max = -Infinity, mt = 0, md = 0;
  for (const s of samples) {
    smoothed = smoothDrift(smoothed, s.driftMs);
    min = Math.min(min, s.driftMs);
    max = Math.max(max, s.driftMs);
    mt += s.t;
    md += s.driftMs;
  }
  mt /= n;
  md /= n;
  let num = 0, den = 0;
  for (const s of samples) {
    num += (s.t - mt) * (s.driftMs - md);
    den += (s.t - mt) ** 2;
  }
  return {
    n,
    lastMs: samples[n - 1].driftMs,
    smoothedMs: smoothed,
    minMs: min,
    maxMs: max,
    slopeMsPerMin: den > 0 ? (num / den) * 60_000 : 0,
    spanS: (samples[n - 1].t - samples[0].t) / 1000,
  };
}
