// The Practice screen's metronome without a take (AUDIO-DESIGN §2.3): the take's planner with an endless spec, fed
// to the AudioPort by the same feeder (≥ 2 s handed over, 4 s chunks, heard times zero + k × beatMs).
import type { Clock } from '../platform.ts';
import type { AudioPort } from './audioPort.ts';
import { createFeeder, leadMs, type FeedStats } from './feeder.ts';
import { planWords, type ClickFeel, type PlanSpec } from './plan.ts';
import { beatsPerBar } from '../engine/chart.ts';
import { beatMs as toBeatMs } from '../engine/run.ts';

export type MetronomeSpec = {
  bpm: number;
  /** Default 4/4. An odd /8 meter clicks 8ths, accenting each group (7/8: 2+2+3). */
  timeSignature?: readonly [number, number];
  subdivision?: 1 | 2 | 4;
  clickOn?: ClickFeel;
  gapBars?: number;
  /** Bars of count-in before beat 0 (default 0), spoken with `countVoice`. */
  countInBars?: number;
  countVoice?: boolean;
};

export interface Metronome {
  /** Starts the audio, then picks zero = now + lead + count-in and hands the first 4 s over. */
  start(): Promise<void>;
  /** Call ~10×/s: keeps ≥ 2 s handed over. */
  tick(now: number): void;
  /** Cancels everything not yet sounding. */
  stop(): void;
  /** Beats since beat 0 (negative in the count-in). */
  position(now: number): number;
  readonly running: boolean;
  readonly zero: number;
  readonly beatMs: number;
  readonly stats: FeedStats | null;
}

export function createMetronome(deps: { clock: Clock; audio: AudioPort }, m: MetronomeSpec): Metronome {
  const { clock, audio } = deps;
  const timeSignature = m.timeSignature ?? [4, 4], beatMs = toBeatMs(m.bpm);
  const countInBeats = (m.countInBars ?? 0) * beatsPerBar({ timeSignature });
  let feeder: ReturnType<typeof createFeeder> | null = null, zero = 0, state: 'idle' | 'starting' | 'running' = 'idle';
  return {
    async start() {
      if (state !== 'idle') return;
      state = 'starting';
      const missing = new Set<string>();
      try {
        await audio.start();
        const words = planWords({ timeSignature, countInBeats, countVoice: m.countVoice });
        if (words.length) (await audio.prepareWords(words)).missing.forEach(w => missing.add(w));
      } catch { /* no audio: the metronome is silent, its position still runs */ }
      if (state !== 'starting') return; // stopped while starting
      const now = clock.now();
      zero = now + leadMs(audio) + countInBeats * beatMs;
      const spec: PlanSpec = {
        zero, beatMs, timeSignature, countInBeats, metronome: true, subdivision: m.subdivision ?? 1, clickOn: m.clickOn,
        gapBars: m.gapBars, endBeat: Infinity, countVoice: m.countVoice, missingWords: missing,
      };
      feeder = createFeeder(audio, spec, -countInBeats);
      state = 'running';
      feeder.topUp(now);
    },
    tick(now) {
      if (state === 'running') feeder!.topUp(now);
    },
    stop() {
      if (state === 'running') audio.cancel();
      state = 'idle';
    },
    position: now => (now - zero) / beatMs,
    get running() { return state === 'running'; },
    get zero() { return zero; },
    beatMs,
    get stats() { return feeder?.stats ?? null; },
  };
}
