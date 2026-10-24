import { beatsPerBar, padMatches, type Chart } from '../engine/chart';
import { buildRun, beatMs as toBeatMs, type Run, type RunOptions } from '../engine/run';
import { computeStats, createMatcher, type Judgement, type NoteResult, type PlayedHit, type RunStats } from '../engine/scoring';
import { onHit } from '../input/hits';
import { getSettings } from '../input/settings';
import { audio, audioToPerf, click, playBuffer } from './audio';

export type PlayOptions = RunOptions & {
  speed: number; // 0.5–1
  metronome: boolean;
  subdivision: 1 | 2 | 4;
  countInBars: number;
  wait: boolean;
  backing?: { buffer: AudioBuffer; syncOffsetMs: number };
};
export type Finished = { zero: number; chart: Chart; run: Run; options: PlayOptions; results: NoteResult[]; extras: PlayedHit[]; hits: PlayedHit[]; stats: RunStats; startedAt: string; durationS: number };
export type Feedback = { lane: string; judgement: Judgement | 'extra'; time: number };

type State = {
  phase: 'idle' | 'playing' | 'done';
  chart?: Chart; run?: Run; options?: PlayOptions;
  zero: number; beatMs: number;   // perf ms of run beat 0, ms per beat
  results: NoteResult[]; feedback: Feedback[];
  waitPos: number; waitGroup: number; waitLast: number;
  finished?: Finished;
};

/** Mutable player state; the highway reads it every frame, React re-renders on phase changes only. */
export const player: State = { phase: 'idle', zero: 0, beatMs: 500, results: [], feedback: [], waitPos: 0, waitGroup: 0, waitLast: 0 };
const listeners = new Set<() => void>();
let version = 0;
const notify = () => { version++; listeners.forEach(l => l()); };
export const subscribePlayer = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const playerVersion = () => version;

let cleanup: (() => void)[] = [];

/** Current position in run beats (negative during count-in). */
export function position(now = performance.now()) {
  if (player.options?.wait) {
    // Advance to the next group of notes and wait there until it's played.
    const groups = waitGroups();
    const target = player.waitGroup < groups.length ? groups[player.waitGroup].t : player.run!.beats;
    player.waitPos = Math.min(target, player.waitPos + (now - player.waitLast) / player.beatMs);
    player.waitLast = now;
    return player.waitPos;
  }
  return (now - player.zero) / player.beatMs;
}

let groupsCache: { run?: Run; groups: { t: number; idx: number[] }[] } = { groups: [] };
function waitGroups() {
  if (groupsCache.run !== player.run) {
    const groups: { t: number; idx: number[] }[] = [];
    player.run!.notes.forEach((n, i) => {
      const last = groups[groups.length - 1];
      if (last && Math.abs(last.t - n.t) < 1e-6) last.idx.push(i); else groups.push({ t: n.t, idx: [i] });
    });
    groupsCache = { run: player.run, groups };
  }
  return groupsCache.groups;
}

export function start(chart: Chart, options: PlayOptions) {
  stop();
  const run = buildRun(chart, options);
  const beatMs = toBeatMs(chart.bpm, options.speed);
  const c = audio();
  const countIn = options.wait ? 0 : options.countInBars * beatsPerBar(chart);
  const t0 = c.currentTime + 0.15; // audio time of the first count-in click
  const zeroAudio = t0 + (countIn * beatMs) / 1000;
  const startedAt = new Date().toISOString();
  Object.assign(player, {
    phase: 'playing', chart, run, options, beatMs, zero: audioToPerf(zeroAudio),
    results: run.notes.map(() => ({ judgement: 'miss' })), feedback: [],
    waitPos: -0.5, waitGroup: 0, waitLast: performance.now(), finished: undefined,
  } satisfies Partial<State>);

  const hits: PlayedHit[] = [];
  const extras: PlayedHit[] = [];
  const latency = getSettings().latencyMs;
  const laneOf = (d: string) => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d);

  if (options.wait) {
    cleanup.push(onHit(h => {
      const hit = { time: h.time, pad: h.pad, velocity: h.velocity };
      hits.push(hit);
      const groups = waitGroups(), g = groups[player.waitGroup];
      if (!g) return;
      const idx = g.idx.find(i => player.results[i].judgement === 'miss' && h.pad && padMatches(run.notes[i].drum, h.pad));
      if (idx === undefined) {
        extras.push(hit);
        player.feedback.push({ lane: h.pad?.startsWith('hh') ? 'hihat' : (h.pad ?? 'snare'), judgement: 'extra', time: h.time });
        return;
      }
      player.results[idx] = { judgement: 'good', offset: 0, velocity: h.velocity };
      player.feedback.push({ lane: laneOf(run.notes[idx].drum), judgement: 'good', time: h.time });
      if (g.idx.every(i => player.results[i].judgement !== 'miss')) {
        player.waitGroup++;
        if (player.waitGroup >= groups.length) finish(hits, extras, startedAt);
      }
    }));
    notify();
    return;
  }

  const match = createMatcher(run.notes.map(n => ({ time: player.zero + n.t * beatMs, drum: n.drum })));
  cleanup.push(onHit(h => {
    const hit = { time: h.time - latency, pad: h.pad, velocity: h.velocity };
    if (hit.time < player.zero - 1000) return; // count-in noodling isn't scored
    hits.push(hit);
    const m = match(hit);
    if (m) {
      player.results[m.index] = { judgement: m.judgement, offset: m.offset, velocity: h.velocity };
      player.feedback.push({ lane: laneOf(run.notes[m.index].drum), judgement: m.judgement, time: h.time });
    } else {
      extras.push(hit);
      const pad = h.pad ?? 'snare';
      player.feedback.push({ lane: pad.startsWith('hh') ? 'hihat' : pad, judgement: 'extra', time: h.time });
    }
    if (player.feedback.length > 64) player.feedback.splice(0, 32);
  }));

  // Lookahead scheduler for clicks (and the end of the run).
  const sub = options.subdivision, bpb = beatsPerBar(chart);
  let k = -countIn * sub;
  const lastK = options.metronome ? run.beats * sub : 0; // metronome off → count-in only
  const timeOf = (k: number) => t0 + ((k / sub + countIn) * beatMs) / 1000;
  const timer = setInterval(() => {
    for (; k < lastK && timeOf(k) < c.currentTime + 0.12; k++) {
      const onBeat = k % sub === 0;
      if (!onBeat && !options.metronome) continue;
      const barStart = onBeat && (((k / sub) % bpb) + bpb) % bpb < 1e-6;
      click(timeOf(k), !onBeat ? 2 : barStart ? 0 : 1);
    }
    if (performance.now() > player.zero + run.beats * beatMs + 400) finish(hits, extras, startedAt);
  }, 25);
  cleanup.push(() => clearInterval(timer));

  if (options.backing) {
    // Song audio: beat b of the chart is at b*60/bpm + offset seconds in the file. Rate = speed (pitch shifts).
    // shortcut: playbackRate changes pitch at <100% speed; use a time-stretch worklet if that bothers you.
    const { buffer, syncOffsetMs } = options.backing;
    const secLen = (run.beats / Math.max(1, options.repeats)) * 60 / chart.bpm;
    const songStart = ((options.fromBar - 1) * bpb * 60) / chart.bpm + syncOffsetMs / 1000;
    const sources: AudioBufferSourceNode[] = [];
    for (let r = 0; r < Math.max(1, options.repeats); r++) {
      const when = zeroAudio + (r * secLen) / options.speed;
      const lead = Math.max(0, -songStart); // audio starts after beat 0
      sources.push(playBuffer(buffer, when + lead / options.speed, Math.max(0, songStart), secLen - lead, options.speed));
    }
    cleanup.push(() => sources.forEach(s => { try { s.stop(); } catch { /* already stopped */ } }));
  }
  notify();
}

function finish(hits: PlayedHit[], extras: PlayedHit[], startedAt: string) {
  const { chart, run, options, results } = player;
  cleanup.forEach(f => f()); cleanup = [];
  const stats = computeStats(run!, results, extras.length);
  player.phase = 'done';
  player.finished = { zero: player.zero, chart: chart!, run: run!, options: options!, results, extras, hits, stats, startedAt, durationS: Math.round((Date.now() - Date.parse(startedAt)) / 1000) };
  notify();
}

export function stop() {
  cleanup.forEach(f => f()); cleanup = [];
  if (player.phase !== 'idle') { player.phase = 'idle'; notify(); }
}
