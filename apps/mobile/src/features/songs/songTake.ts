// A scored take over a YouTube song (Play / Stage mode) on the core take engine (@drum-coach/core/play/take
// createTake) with the song as its ExternalClock, exactly as the web's player.ts startExternal: zero = 0, a stroke's
// time = position(stroke − latency) × beatMs. This file only adapts the take for the screen: it ticks it, and turns
// its judgements into the PlayResult stream NoteHighway draws (a note shows as missed once the song is past it).
// Pure TypeScript (Vitest-tested with the core's fake audio port).
import type { Chart } from '@drum-coach/core/engine/chart';
import { PAD_INFO } from '@drum-coach/core/engine/kit';
import { WINDOWS } from '@drum-coach/core/engine/scoring';
import type { Hit } from '@drum-coach/core/input/hits';
import { createTake, type Finished, type TakeDeps, type TakeOptions } from '@drum-coach/core/play/take';
import type { RunInput } from '../../data/runs';
import { laneOf } from '../../play/chartLike';
import { createStream, type PlayResult, type Subscribe } from '../../play/events';

export type SongTakeResult = Finished;

export type SongTake = {
  /** Resolves once the song has been asked to play (the take's begin). */
  start(): Promise<void>;
  /** Stops early: the take is dropped (the web's Stop). */
  stop(): void;
  position(now: number): number;
  /** The highway's clock: run ms (position × beatMs); the highway's zero is 0. */
  runMs(now: number): number;
  readonly beatMs: number;
  /** The section as a chart from beat 0 (the run's notes, in the order results index them). */
  readonly runChart: Chart;
  readonly results: Subscribe<PlayResult>;
  onFinish(fn: (r: SongTakeResult) => void): () => void;
  readonly running: boolean;
};

export type SongTakeDeps = Omit<TakeDeps, 'onHit'> & {
  onHit: (fn: (h: Hit) => void) => () => void;
  /** Ticks the take (the web polls the external clock every 50 ms); returns a stop function. */
  every: (ms: number, fn: () => void) => () => void;
};

export function createSongTake(deps: SongTakeDeps, chart: Chart, opts: TakeOptions & { external: NonNullable<TakeOptions['external']> }): SongTake {
  const stream = createStream<PlayResult>();
  // The take's own hit listener runs first; then the change it made becomes a result.
  let after: ((h: Hit) => void) | null = null;
  const take = createTake({ ...deps, onHit: fn => deps.onHit(h => { fn(h); after?.(h); }) }, chart, opts);
  const run = take.state.run, beatMs = take.state.beatMs;
  const runChart: Chart = {
    ...chart, bars: Math.max(1, Math.ceil(run.beats / run.beatsPerBar - 1e-9)),
    notes: run.notes.map(({ t, drum, accent, ghost }) => ({ t, drum, ...(accent && { accent }), ...(ghost && { ghost }) })),
  };
  let stopTick: (() => void) | null = null, shown: boolean[] = [], extras = 0;
  const finishers = new Set<(r: SongTakeResult) => void>();
  take.onFinish(f => finishers.forEach(fn => fn(f)));
  take.onEnd(() => { stopTick?.(); stopTick = null; after = null; });

  function judged(i: number) {
    shown[i] = true;
    const r = take.state.results[i];
    stream.emit({ kind: 'judged', index: i, lane: laneOf(run.notes[i].drum), judgement: r.judgement, at: run.notes[i].t * beatMs + (r.offset ?? 0),
      ...(r.offset !== undefined && { offsetMs: r.offset }), ...(r.pad && { pad: r.pad }) });
  }
  return {
    beatMs, runChart, results: stream.subscribe,
    get running() { return take.state.phase === 'starting' || take.state.phase === 'playing'; },
    position: now => take.position(now),
    runMs: now => take.position(now) * beatMs,
    start() {
      shown = run.notes.map(() => false); extras = 0;
      after = h => {
        const s = take.state;
        for (let i = 0; i < s.results.length; i++) if (!shown[i] && (s.results[i].judgement !== 'miss' || s.results[i].offset !== undefined)) judged(i);
        if (s.extraBeats.length > extras) {
          for (const b of s.extraBeats.slice(extras)) stream.emit({ kind: 'extra', lane: h.pad ? PAD_INFO[h.pad].drum : 'snare', at: b * beatMs, ...(h.pad && { pad: h.pad }) });
          extras = s.extraBeats.length;
        }
      };
      const started = take.start();
      stopTick = deps.every(50, () => {
        const now = deps.clock.now(), ms = take.position(now) * beatMs;
        // a note nobody played: missed once the song is well past it
        for (let i = 0; i < run.notes.length; i++) if (!shown[i] && ms > run.notes[i].t * beatMs + WINDOWS.good + WINDOWS.near) judged(i);
        take.tick(now);
      });
      return started;
    },
    stop() { take.stop('user'); },
    onFinish(fn) { finishers.add(fn); return () => { finishers.delete(fn); }; },
  };
}

/** The run a scored song take saves (the web's POST /api/runs from Results.saveRun), with the take's hits (N8). */
export function songRun(r: SongTakeResult, title: string, songId: string): RunInput {
  const s = r.stats, o = r.options, beatMs = 60000 / (r.chart.bpm * o.speed);
  return {
    chartId: songId.slice(0, 80), chartTitle: title.slice(0, 200), startedAt: r.startedAt, durationS: Math.min(36_000, Math.max(0, r.durationS)),
    bpm: r.chart.bpm * o.speed, speed: o.speed, accuracy: s.accuracy, meanOffset: s.meanOffset, spread: s.spread,
    summary: {
      mode: 'play', song: title, notes: s.total, perfect: s.perfect, good: s.good, miss: s.miss, extra: s.extra,
      meanOffsetMs: s.meanOffset, spreadMs: s.spread, perDrum: s.perDrum, velocity: s.velocity, streak: s.streak,
      section: { fromBar: o.fromBar, toBar: o.toBar },
    },
    take: {
      beatMs, beats: r.run.beats, beatsPerBar: r.run.beatsPerBar, timeSignature: r.chart.timeSignature,
      hits: r.hits.slice(0, 4000).map(h => [Math.round(h.time), h.pad ?? 'snare', Math.max(0, Math.min(127, Math.round(h.velocity)))]),
    },
  };
}
