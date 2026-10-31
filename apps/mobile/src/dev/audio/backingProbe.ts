// The audio debug screen's Backing card (A4p3): start the test tone on the metronome's next bar, then read
// `backing.anchor()` about 10×/s for 2 minutes and show the drift against the requested line (AUDIO-DESIGN §6).
// "Loop 1 bar" (F2) plays the tone's first bar again and again (one start, then queued segments): its drift is read
// against the line of the repeat each anchor is in, so a gap or overlap at a seam would show as a step.
import type { BackingPort } from '@drum-coach/core/play/audioPort';
import { backingDriftMs, summarizeDrift, type BackingStartRequest, type DriftSummary } from '../../../modules/drum-audio/src/backing';

export const DRIFT_WINDOW_MS = 120_000;

/** The first bar line of a click grid (zero + n × barMs) heard at or after now + leadMs. */
export function nextBarAt(zero: number, barMs: number, now: number, leadMs: number): number {
  const n = Math.max(0, Math.ceil((now + leadMs - zero) / barMs - 1e-9));
  return zero + n * barMs;
}

/** The tone is written at bpm / rate so that, played at `rate`, its beats land on the click at `bpm`. */
export function toneBpm(clickBpm: number, rate: number): number {
  return clickBpm / rate;
}

/** Ms per repeat for a looped bar, else the drift against the single line. */
export function loopDriftMs(request: BackingStartRequest, loopMs: number | undefined, a: { at: number; fileMs: number }): number {
  const d = backingDriftMs(request, a);
  if (!loopMs || !(loopMs > 0)) return d;
  return d - Math.max(0, Math.round(d / loopMs)) * loopMs; // the repeat it sits closest to
}

/** The segments for `repeats` more bars after the first: each on the same line, `loopMs` later. */
export function loopSegments(request: BackingStartRequest, loopMs: number, repeats: number): { at: number; offsetMs: number; durationMs: number }[] {
  return Array.from({ length: Math.max(0, repeats) }, (_, i) => ({ at: request.at + (i + 1) * loopMs, offsetMs: request.offsetMs, durationMs: request.durationMs ?? loopMs * request.rate }));
}

export type DriftRecorder = {
  readonly request: BackingStartRequest;
  /** Reads the anchor once; returns false once the window is over (or nothing plays). Repeated anchors count once. */
  poll(): boolean;
  summary(): DriftSummary & { elapsedMs: number; done: boolean };
};

export function createDriftRecorder(port: Pick<BackingPort, 'anchor'>, request: BackingStartRequest, windowMs = DRIFT_WINDOW_MS, loopMs?: number): DriftRecorder {
  const samples: { t: number; driftMs: number }[] = [];
  let first: number | null = null;
  let lastAt = Number.NaN;
  let done = false;
  return {
    request,
    poll() {
      if (done) return false;
      const a = port.anchor();
      if (!a) return true; // not heard yet, or between render cycles
      if (a.at === lastAt) return true;
      lastAt = a.at;
      first ??= a.at;
      samples.push({ t: a.at, driftMs: loopDriftMs(request, loopMs, a) });
      if (a.at - first >= windowMs) done = true;
      return !done;
    },
    summary() {
      const s = summarizeDrift(samples);
      return { ...s, elapsedMs: first == null ? 0 : samples[samples.length - 1].t - first, done };
    },
  };
}
