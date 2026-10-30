// The native scheduler's policy as pure functions (docs/mobile/AUDIO-DESIGN.md §1.1, §2.1, §5).
// ios/Core/Sources/DrumAudioCore/AudioPolicy.swift is a line-by-line mirror of this file: change both together. The
// tests here (policy.test.ts) are the policy's tests; the Swift tests (ios/Core/Tests) run the same vectors.
//
// Times: `at` is when a sound is HEARD (Clock ms = mach host ms). Native hands a buffer to AVAudioEngine at its
// "schedule time" = at − heardOffsetMs − onsetMs, where onsetMs is how far into the buffer the sound starts (words).

/** The lookahead loop: a 10 ms timer moves every event whose schedule time is within 120 ms into a player node. */
export type LoopPolicy = {
  /** Timer interval, ms. */
  tickMs: number;
  /** Events whose schedule time is before now + windowMs are handed to a player node. */
  windowMs: number;
  /** Extra margin on top of the IO buffer: an event handed over later than this is dropped as `late`. */
  safetyMs: number;
  /** The most events native holds (a runaway planner can't eat memory); past it, events are dropped. */
  maxPending: number;
};

export const defaultLoopPolicy: Readonly<LoopPolicy> = Object.freeze({ tickMs: 10, windowMs: 120, safetyMs: 10, maxPending: 20_000 });

/**
 * What a player node's `AVAudioTime(hostTime:)` means (M5 decides, AUDIO-DESIGN §5):
 * - 'A'  : the sample leaves the engine; outputLatency covers the hardware (the probe's and the web's assumption).
 * - 'B'  : host time already means "at the speaker".
 * - 'A2' : host time means "rendered into the IO buffer" (A′ in the design).
 */
export type HeardOffsetBranch = 'A' | 'B' | 'A2';

/** The one constant M5/M5b flips (mirrored in AudioPolicy.swift `heardOffsetBranch`). */
export const HEARD_OFFSET_BRANCH: HeardOffsetBranch = 'A';

/** Schedule time + heardOffsetMs = heard time. */
export function heardOffsetMs(outputLatencyMs: number, ioBufferMs: number, branch: HeardOffsetBranch = HEARD_OFFSET_BRANCH): number {
  switch (branch) {
    case 'A':
      return outputLatencyMs;
    case 'B':
      return 0;
    case 'A2':
      return outputLatencyMs + ioBufferMs;
  }
}

/** Hand events over at least this long before they're heard: ioBufferMs + heardOffsetMs + safety (AudioRoute.minLeadMs). */
export function minLeadMs(ioBufferMs: number, heardOffset: number, policy: LoopPolicy = defaultLoopPolicy): number {
  return ioBufferMs + heardOffset + policy.safetyMs;
}

/** When the buffer must start in the engine (host ms). */
export function scheduleTimeMs(atMs: number, heardOffset: number, onsetMs: number): number {
  return atMs - heardOffset - onsetMs;
}

/**
 * The late rule: a buffer whose schedule time is earlier than now + ioBuffer + safety can't be placed exactly, so it
 * is dropped and counted, never played late (the web's "drop what's due instead of playing it all at once").
 * For an event with onset 0 this is exactly `at < now + minLeadMs`.
 */
export function isLate(scheduleMs: number, nowMs: number, ioBufferMs: number, policy: LoopPolicy = defaultLoopPolicy): boolean {
  return scheduleMs < nowMs + ioBufferMs + policy.safetyMs;
}

/** Whether the loop hands this event to a player node on the tick at `nowMs`. */
export function isDue(scheduleMs: number, nowMs: number, policy: LoopPolicy = defaultLoopPolicy): boolean {
  return scheduleMs < nowMs + policy.windowMs;
}

/** The largest gain an event may ask for (AudioEvent.gain is 0..1.5). */
export const MAX_GAIN = 1.5;

/** Gain steps per unit gain: clicks and words 16 (≤ 3 % error), drums 8 (the "8 velocity layers"). */
export const GAIN_STEPS = Object.freeze({ click: 16, drum: 8, word: 16 });

/**
 * Gains are baked into cached buffer copies (a player node's volume can't be scheduled), so they are quantised:
 * step = round(clamp(gain, 0, 1.5) × stepsPerUnit). Step 0 is silence (the event is accepted and not played).
 * NaN counts as 0.
 */
export function gainStep(gain: number, stepsPerUnit: number): number {
  const g = Number.isFinite(gain) ? Math.min(Math.max(gain, 0), MAX_GAIN) : 0;
  return Math.round(g * stepsPerUnit);
}

/** The buffer gain a step stands for. */
export function stepGain(step: number, stepsPerUnit: number): number {
  return step / stepsPerUnit;
}

export type Bus = 'click' | 'drums' | 'band' | 'voice' | 'backing';

/** Player-node pools per bus: start size and cap (AUDIO-DESIGN §1.1). */
export const POOLS: Readonly<Record<Bus, { initial: number; cap: number }>> = Object.freeze({
  click: { initial: 2, cap: 4 },
  drums: { initial: 12, cap: 24 },
  band: { initial: 8, cap: 16 },
  voice: { initial: 2, cap: 4 },
  backing: { initial: 1, cap: 1 },
});

export type VoicePick = { kind: 'use'; index: number } | { kind: 'grow'; index: number } | { kind: 'drop' };

/**
 * The pool allocator. One AVAudioPlayerNode plays its buffers in sequence, so a node only gets a buffer that starts at
 * or after the end of everything already scheduled on it. `busyUntilMs[i]` = end (schedule-time ms) of node i's last
 * buffer. Picks the lowest free node; else grows the pool up to `cap`; else drops (counted in stats().dropped).
 */
export function pickVoice(busyUntilMs: readonly number[], startMs: number, cap: number): VoicePick {
  for (let i = 0; i < busyUntilMs.length; i++) if (busyUntilMs[i] <= startMs) return { kind: 'use', index: i };
  return busyUntilMs.length < cap ? { kind: 'grow', index: busyUntilMs.length } : { kind: 'drop' };
}

export type RouteKind = 'speaker' | 'wired' | 'usb' | 'bluetooth' | 'airplay' | 'other';

/** AVAudioSession.Port raw values → AudioRoute.kind. */
export function routeKind(portType: string): RouteKind {
  switch (portType) {
    case 'Speaker':
    case 'Receiver':
      return 'speaker';
    case 'Headphones':
    case 'LineOut':
      return 'wired';
    case 'USBAudio':
      return 'usb';
    case 'BluetoothA2DPOutput':
    case 'BluetoothLE':
    case 'BluetoothHFP':
      return 'bluetooth';
    case 'AirPlay':
      return 'airplay';
    default:
      return 'other';
  }
}

/** The stored-latency key: "Speaker" for the built-in speaker (its uid isn't meaningful), else "portType:uid". */
export function routeKey(portType: string, uid: string): string {
  if (routeKind(portType) === 'speaker' || uid === '') return portType;
  return `${portType}:${uid}`;
}

/**
 * Two routes count as "the same" (no route event) when the key, the rate and the buffer match and the reported
 * latency moved by less than 0.5 ms. Anything else cancels and re-reads (AUDIO-DESIGN §3.3).
 */
export function sameRoute(
  a: { key: string; sampleRate: number; ioBufferMs: number; outputLatencyMs: number },
  b: { key: string; sampleRate: number; ioBufferMs: number; outputLatencyMs: number },
): boolean {
  return a.key === b.key && a.sampleRate === b.sampleRate && Math.abs(a.ioBufferMs - b.ioBufferMs) < 0.5 &&
    Math.abs(a.outputLatencyMs - b.outputLatencyMs) < 0.5;
}

/** Voice ducking (the web's playVoice): click, drums, band and backing dip to 45 % while a voice-bus sound plays. */
export const DUCK = Object.freeze({ level: 0.45, rampMs: 30 });

/** One tick of the duck ramp: moves `current` toward `target` by at most tickMs/rampMs of the full dip. */
export function duckStep(current: number, target: number, tickMs: number = defaultLoopPolicy.tickMs): number {
  const max = ((1 - DUCK.level) * tickMs) / DUCK.rampMs;
  return current < target ? Math.min(target, current + max) : Math.max(target, current - max);
}
