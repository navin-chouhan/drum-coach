// Gate 0 tap-to-click test, the clock rule in one place. New for the spike; the scoring math is LatencyCard's
// (see latency.ts).
//
// Clock rule: every time here is DrumMidi.nowMs() milliseconds (mach host time). The clicks are scheduled natively
// at host times (AVAudioPlayerNode.scheduleBuffer(at: AVAudioTime(hostTime:))) and MIDI hits carry CoreMIDI host
// timestamps, so both sides are on the same clock with no JS timing in between.
//
// Output latency: the web app compares hits with the time a click is *heard* (audioToPerf: getOutputTimestamp, or
// currentTime + baseLatency + outputLatency). Here: heard = scheduled host time + AVAudioSession.outputLatency.
// Both offsets are reported, so the device run shows which one the taps agree with (GATE0.md, M5).

import { keepTaps, tapTestResult, TAP_TEST } from './latency';
import type { AudioInfo, TapTestRun } from './results';

/** Lead time before the first click so scheduling never lands in the past. */
export const LEAD_MS = 400;

export type TapTestPlan = { bpm: number; countIn: number; clicks: number; startHostMs: number; total: number };

export function planTapTest(nowMs: number, cfg: { bpm: number; countIn: number; clicks: number } = TAP_TEST): TapTestPlan {
  return { ...cfg, startHostMs: nowMs + LEAD_MS, total: cfg.countIn + cfg.clicks };
}

/** When the test is over: the last click plus one beat and a bit, in host ms. */
export const tapTestEndMs = (p: TapTestPlan) => p.startHostMs + p.total * (60000 / p.bpm) + 500;

/**
 * Builds the run from the host times the native scheduler actually used (count-in included) and the snare hits.
 * Count-in clicks are not scored, as in LatencyCard.
 */
export function buildTapTestRun(plan: TapTestPlan, scheduledMs: number[], audio: AudioInfo, snareHitMs: number[], at = new Date()): TapTestRun {
  const scored = scheduledMs.slice(plan.countIn);
  const heard = scored.map(t => t + audio.outputLatencyMs);
  return {
    at: at.toISOString(), bpm: plan.bpm, countIn: plan.countIn, clicks: plan.clicks,
    clickHeardMs: heard, clickScheduledMs: scored, tapMs: snareHitMs, audio,
    result: tapTestResult(heard, keepTaps(heard, snareHitMs)),
    resultVsScheduled: tapTestResult(scored, keepTaps(scored, snareHitMs)),
  };
}
