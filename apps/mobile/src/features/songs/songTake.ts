// A scored take over a YouTube song (Play / Stage mode). The song is the clock, as the web's player.ts `external`
// path (zero = 0; a stroke's time = position(stroke − latency) × beatMs): the core's matcher judges each stroke as it
// comes, a note is missed once the song is past its Good window, and the core's computeStats scores the take.
//
// Interim: the core take engine (createTake, A4p2) isn't merged yet. When it is, this becomes
// createTake(deps, songTakeOptions(...)) and this file goes; the screen only uses start / stop / results / onFinish.
// Pure TypeScript (Vitest-tested).
import { beatsPerBar, type Chart } from '@drum-coach/core/engine/chart';
import { PAD_INFO } from '@drum-coach/core/engine/kit';
import type { Hit } from '@drum-coach/core/input/hits';
import { buildRun, type Run } from '@drum-coach/core/engine/run';
import { computeStats, createMatcher, noteWindows, toResult, WINDOWS, type NoteResult, type PlayedHit, type RunStats } from '@drum-coach/core/engine/scoring';
import type { RunInput } from '../../data/runs';
import { createStream, type PlayResult, type Subscribe } from '../../play/events';
import { laneOf } from '../../play/chartLike';

export type SongTakeResult = {
  chart: Chart; run: Run; results: NoteResult[]; extras: PlayedHit[]; hits: PlayedHit[]; stats: RunStats;
  beatMs: number; bpm: number; speed: number; fromBar: number; toBar: number; startedAt: string; durationS: number;
};

export type SongTake = {
  /** Seeks a bar before `from`, plays, and listens to the hits. */
  start(): void;
  /** Stops early: the take is dropped (as the web's Stop). */
  stop(): void;
  /** Run position in beats at Clock `now` (negative in the pre-roll bar). */
  position(now: number): number;
  /** The highway's clock: run ms (position × beatMs), so the highway's zero is 0. */
  runMs(now: number): number;
  readonly beatMs: number;
  /** The chart cut to the section (run beats from 0), for the highway. */
  readonly runChart: Chart;
  readonly results: Subscribe<PlayResult>;
  onFinish(fn: (r: SongTakeResult) => void): () => void;
  readonly running: boolean;
};

export type SongTakeDeps = {
  now: () => number;
  onHit: (fn: (h: Hit) => void) => () => void;
  /** Polls (the web polls the external clock every 50 ms); returns a stop function. */
  every: (ms: number, fn: () => void) => () => void;
  wallClock?: () => Date;
};

export function createSongTake(deps: SongTakeDeps, o: {
  chart: Chart; bpm: number; speed: number; fromBar: number; toBar: number; latencyMs: number;
  external: { position(hostMs: number): number; begin(): void; end(): void };
}): SongTake {
  const run = buildRun(o.chart, { fromBar: o.fromBar, toBar: o.toBar, repeats: 1 });
  const beatMs = 60000 / o.bpm;
  const expected = noteWindows(run.notes.map(n => ({ time: n.t * beatMs, drum: n.drum })));
  const stream = createStream<PlayResult>();
  const finishers = new Set<(r: SongTakeResult) => void>();
  const bpb = beatsPerBar(o.chart);
  const runChart: Chart = { ...o.chart, bars: Math.max(1, Math.ceil(run.beats / bpb - 1e-9)), notes: run.notes.map(({ t, drum, accent, ghost }) => ({ t, drum, ...(accent && { accent }), ...(ghost && { ghost }) })) };
  let running = false, offs: (() => void)[] = [], startedAt = '', startedMs = 0;
  let match = createMatcher(expected), results: NoteResult[] = [], judged: boolean[] = [], hits: PlayedHit[] = [], extras: PlayedHit[] = [];

  const position = (now: number) => o.external.position(now);
  const cleanup = () => { offs.forEach(f => f()); offs = []; running = false; };
  function finish() {
    for (let i = 0; i < expected.length; i++) if (!judged[i]) missed(i);
    const stats = computeStats(run, results, extras.length, beatMs);
    const r: SongTakeResult = {
      chart: o.chart, run, results, extras, hits, stats, beatMs, bpm: o.bpm, speed: o.speed, fromBar: o.fromBar, toBar: o.toBar,
      startedAt, durationS: Math.round((deps.now() - startedMs) / 1000),
    };
    cleanup();
    o.external.end();
    finishers.forEach(f => f(r));
  }
  function missed(i: number) {
    judged[i] = true;
    stream.emit({ kind: 'judged', index: i, lane: laneOf(expected[i].drum), judgement: 'miss', at: expected[i].time });
  }
  return {
    beatMs, runChart, results: stream.subscribe,
    get running() { return running; },
    position,
    runMs: now => position(now) * beatMs,
    start() {
      if (running) return;
      match = createMatcher(expected);
      results = expected.map(() => ({ judgement: 'miss' }));
      judged = expected.map(() => false); hits = []; extras = [];
      startedAt = (deps.wallClock?.() ?? new Date()).toISOString(); startedMs = deps.now();
      running = true;
      o.external.begin();
      offs.push(deps.onHit(h => {
        if (!h.pad) return;
        const t = position(h.time - o.latencyMs) * beatMs;
        if (t < -WINDOWS.near) return; // the pre-roll bar
        const hit: PlayedHit = { time: t, pad: h.pad, velocity: h.velocity };
        hits.push(hit);
        const m = match(hit);
        if (m?.bounce) return;
        if (m) {
          results[m.index] = toResult(m, h.velocity, h.pad);
          judged[m.index] = true;
          stream.emit({ kind: 'judged', index: m.index, lane: laneOf(expected[m.index].drum), judgement: m.judgement, offsetMs: m.offset, at: t, pad: h.pad });
        } else {
          extras.push(hit);
          stream.emit({ kind: 'extra', lane: PAD_INFO[h.pad].drum, at: t, pad: h.pad });
        }
      }));
      offs.push(deps.every(50, () => {
        const ms = position(deps.now()) * beatMs;
        for (let i = 0; i < expected.length; i++) if (!judged[i] && ms > expected[i].time + (expected[i].good ?? WINDOWS.good) + WINDOWS.near) missed(i);
        if (ms > run.beats * beatMs + WINDOWS.near) finish();
      }));
    },
    stop() {
      if (!running) return;
      cleanup();
      o.external.end();
    },
    onFinish(fn) { finishers.add(fn); return () => { finishers.delete(fn); }; },
  };
}

/** The run a scored song take saves (the web's POST /api/runs from Results.saveRun), with the take's hits (N8). */
export function songRun(r: SongTakeResult, title: string, songId: string): RunInput {
  const s = r.stats;
  return {
    chartId: songId.slice(0, 80), chartTitle: title.slice(0, 200), startedAt: r.startedAt, durationS: Math.min(36_000, Math.max(0, r.durationS)),
    bpm: r.bpm, speed: r.speed, accuracy: s.accuracy, meanOffset: s.meanOffset, spread: s.spread,
    summary: {
      mode: 'play', song: title, notes: s.total, perfect: s.perfect, good: s.good, miss: s.miss, extra: s.extra,
      meanOffsetMs: s.meanOffset, spreadMs: s.spread, perDrum: s.perDrum, velocity: s.velocity, streak: s.streak,
      section: { fromBar: r.fromBar, toBar: r.toBar },
    },
    take: {
      beatMs: r.beatMs, beats: r.run.beats, beatsPerBar: r.run.beatsPerBar, timeSignature: r.chart.timeSignature,
      hits: r.hits.slice(0, 4000).map(h => [Math.round(h.time), h.pad ?? 'snare', Math.max(0, Math.min(127, Math.round(h.velocity)))]),
    },
  };
}
