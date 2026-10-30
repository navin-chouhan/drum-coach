// Gate 0 probe: the JSON the owner copies back ("Copy results"), and a tap-test take in the
// src/input/fixtures/*.json format ("Copy as fixture"). New for the spike.

import type { TapTestResult } from './latency';
import { DEFAULT_NOTE_MAP, type NoteMap } from './kit';
import type { Counters, LogEntry } from './probe';
import type { Summary } from './stats';

export type InputInfo = { id: string; name: string; manufacturer: string; online: boolean };
export type AudioInfo = { outputLatencyMs: number; ioBufferMs: number; sampleRate: number; route?: string };

export type TapTestRun = {
  at: string;
  bpm: number;
  countIn: number;
  clicks: number;
  /** Heard click times: scheduled host time + the session's output latency (as the web app's audioToPerf does). */
  clickHeardMs: number[];
  /** Host times the clicks were scheduled at (AVAudioTime(hostTime:)). */
  clickScheduledMs: number[];
  /** Snare hit times (hostTimeMs), after the bounce/crosstalk filter. */
  tapMs: number[];
  audio: AudioInfo;
  /** Offsets from the heard clicks: the web-equivalent number. */
  result: TapTestResult;
  /** Offsets from the scheduled clicks (no output latency): tells the device run whether the latency term is right. */
  resultVsScheduled: TapTestResult;
};

export type ProbeResults = {
  kind: 'drum-coach-gate0-probe';
  version: 1;
  createdAt: string;
  app: { platform: string; osVersion: string | number; model?: string; expoSdk?: string };
  moduleAvailable: boolean;
  selected?: InputInfo;
  inputs: InputInfo[];
  networkSessionEnabled: boolean;
  counters: Counters;
  framer: { droppedBytes: number; sysex: number };
  bridgeDelayMs: Summary | null;
  nativeDelayMs: Summary | null;
  audio?: AudioInfo;
  tapTests: TapTestRun[];
  debug?: Record<string, unknown>;
  /** The last raw messages: [ms after the first of them, ...bytes]. */
  lastMessages: number[][];
  lastLog: LogEntry[];
  /** Every non-realtime message since the last reset (up to 300), oldest first: the pad check reads this. */
  noteLog?: LogEntry[];
};

const r1 = (x: number) => Math.round(x * 10) / 10;

export function relativeMessages(capture: readonly number[][], last = 300): number[][] {
  const tail = capture.slice(-last);
  const t0 = tail[0]?.[0] ?? 0;
  return tail.map(([t, ...b]) => [r1(t - t0), ...b]);
}

/**
 * A tap-test take as a src/input/fixtures/*.json fixture: the chart is one snare per beat at the test's tempo,
 * beat 0 is the first scored click as heard, and latencyMs is the take's own median. `expect` is left for whoever
 * adds it to the repo (replay it once and fill in minLanded / maxExtras).
 */
export function tapTestFixture(run: TapTestRun, capture: readonly number[][], name: string, noteMap: NoteMap = DEFAULT_NOTE_MAP) {
  const zero = run.clickHeardMs[0], end = run.clickHeardMs[run.clickHeardMs.length - 1] + 1000;
  const beatsPerBar = 4, bars = Math.max(1, Math.round(run.clicks / beatsPerBar));
  return {
    name, source: 'MPS-150' as const, recordedAt: run.at.slice(0, 10),
    note: `Gate 0 tap test on iOS (${run.bpm} BPM, ${run.clicks} snare taps), recorded by spikes/midi-probe`,
    noteMap,
    chart: { title: 'Gate 0 tap test', bpm: run.bpm, timeSignature: [4, 4] as [number, number], bars: 1,
      notes: Array.from({ length: beatsPerBar }, (_, i) => ({ t: i, drum: 'snare' as const })) },
    speed: 1, fromBar: 1, toBar: 1, repeats: bars, latencyMs: run.result?.latencyMs ?? 0,
    midi: capture.filter(([t]) => t >= zero - 2000 && t <= end).map(([t, ...b]) => [r1(t - zero), ...b]),
    expect: {},
  };
}
