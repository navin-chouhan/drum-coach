// The take engine (B21, AUDIO-DESIGN §2.3): one clock-agnostic take for the iPad and (later) the web, so both score
// the same way. It is the web's src/play/player.ts (start / startExternal / finish / stop / position / waitGroups /
// liveCheck) without its globals, timers or Web Audio:
// - Every time in and out is on the one Clock (platform.ts): hit times, `zero` (the HEARD time of run beat 0), the
//   heard times of planned sounds. Scoring only subtracts times from that Clock, so a take shifted by 1e9 ms scores
//   the same.
// - No timers: the app calls tick(now) about 10×/s (or every frame). tick keeps ≥ 2 s of sound handed to the
//   AudioPort, runs the live tips once per bar and ends the take.
// - Matching and scoring are the core's (engine/scoring.ts), called exactly as player.ts calls them.
import type { Clock } from '../platform.ts';
import type { AudioPort, AudioRoute } from './audioPort.ts';
import { createFeeder, leadMs, type FeedStats } from './feeder.ts';
import { planSpecFor, planWords, type PlanOptions } from './plan.ts';
import type { BandSpec } from '../engine/band.ts';
import { beatsPerBar, padMatches, type Chart, type ChartDrum } from '../engine/chart.ts';
import { swingPct } from '../engine/feel.ts';
import { expandForm } from '../engine/form.ts';
import { inFreeBar } from '../engine/jam.ts';
import { createLiveCoach, type Chattiness, type Cue } from '../engine/liveCoach.ts';
import { buildRun, splitRun, beatMs as toBeatMs, type Run, type RunOptions } from '../engine/run.ts';
import { computeStats, createMatcher, noteWindows, reactingToClick, toResult, windowsFor, type Judgement, type NoteResult, type PlayedHit, type RunStats } from '../engine/scoring.ts';
import type { Hit } from '../input/hits.ts';

/** The settings a take reads once, when it starts (core input/settings.ts Settings has them all). */
export type TakeSettings = { latencyMs: number; countIn: boolean; liveTips: 'off' | 'screen' | 'voice'; chattiness: Chattiness };

export type TakeDeps = {
  clock: Clock;
  audio: AudioPort;
  /** The core hit bus (input/hits.ts createHitBus().onHit), already on the Clock. */
  onHit: (fn: (h: Hit) => void) => () => void;
  settings: () => TakeSettings;
  /** The coach's wording for a live tip (web: coach/aiTips.ts applyTip). Default: the rule's own words. */
  wording?: (chart: Chart, cue: Cue) => Cue;
  /** Wall-clock ms for `startedAt` / `durationS` (default Date.now). Never used for timing. */
  wallClock?: () => number;
};

/** A song clock someone else owns (a YouTube video): run beats at a Clock time. Scoring then uses beats × beatMs. */
export type ExternalClock = { position: (now: number) => number; begin: () => void; end: () => void };

/** One take: src/play/player.ts PlayOptions without the web-only parts (AudioBuffer backing). Extra fields ride along. */
export type TakeOptions = RunOptions & PlanOptions & {
  speed: number;            // 0.5–1
  wait: boolean;            // wait mode: the run advances to each group of notes and waits there until it's played
  external?: ExternalClock;
  activeLanes?: ChartDrum[];
  freeBars?: number[];
  seconds?: number;         // an endless take that ends by itself after this long
  endless?: boolean;        // loops until stop('user'), which keeps the whole bars played
  goodMs?: number;          // a wider Good window (engine/lesson.ts goodMsFor)
  band?: BandSpec;
  feelTarget?: { ms: number; tol: number };
  swingWant?: [number, number];
};

export type Feedback = { lane: string; judgement: Judgement | 'extra'; time: number };
export type StopReason = 'user' | 'interrupted';

/** The finished take, as player.ts `Finished`, plus `interrupted` (D6: kept, flagged, not for the ladder or stars). */
export type Finished<O extends TakeOptions = TakeOptions> = {
  cues: Cue[]; zero: number; chart: Chart; run: Run; options: O; results: NoteResult[]; extras: PlayedHit[]; hits: PlayedHit[];
  stats: RunStats; startedAt: string; durationS: number; interrupted?: true;
};

/** How a take ended: `finished` is null for a demo, a dropped take or an interrupted take under 2 whole bars. */
export type TakeEnd<O extends TakeOptions = TakeOptions> = { reason: 'end' | StopReason; finished: Finished<O> | null };

/** Live state a view reads every frame (the highway, the sheet): the web `player` fields. */
export type TakeState<O extends TakeOptions = TakeOptions> = {
  phase: 'idle' | 'starting' | 'playing' | 'done';
  chart: Chart; run: Run; options: O;
  zero: number; beatMs: number;     // the heard Clock ms of run beat 0, ms per beat
  results: NoteResult[]; feedback: Feedback[];
  auto: boolean[];                  // per run note: played by the app, not the student
  cue?: { cue: Cue; at: number };   // latest live tip (Clock ms)
  extraBeats: number[];             // where extra hits landed (run beats), for the sheet's ✕ marks
  waitPos: number; waitGroup: number; waitLast: number;
  finished?: Finished<O>;
  /** The route the take started on (null: no audio), words the port couldn't prepare, what was handed over. */
  route: AudioRoute | null; missingWords: string[]; audioError?: string; feed: FeedStats | null;
};

export interface Take<O extends TakeOptions = TakeOptions> {
  /** Starts the audio, prepares the words, picks zero = now + lead + count-in (lead = max(300, minLeadMs + 100)), hands over 4 s. */
  start(): Promise<void>;
  /** Call ~10×/s: keeps ≥ 2 s of plan in native, live tips, the end. */
  tick(now: number): void;
  /** Run beats at a Clock time (negative in the count-in; wait mode advances to the next group and waits there). */
  position(now: number): number;
  /**
   * 'user': an endless take keeps its whole bars, any other take is dropped. 'interrupted' (§4): ends at the last
   * whole bar before `at` (default now) and keeps it, flagged, if that's ≥ 2 bars with notes; a wait-mode take is dropped.
   */
  stop(reason?: StopReason, at?: number): void;
  readonly state: TakeState<O>;
  /** A scored take finished (not for demos or dropped takes). */
  onFinish(fn: (f: Finished<O>) => void): () => void;
  /** Every end, with its reason (a demo's end, to run `then`; a discarded interrupted take, for its toast). */
  onEnd(fn: (e: TakeEnd<O>) => void): () => void;
  /** Every live tip as it's given (for the voice). */
  onCue(fn: (c: Cue) => void): () => void;
  /** The phase changed (the web's subscribePlayer). */
  onChange(fn: () => void): () => void;
}

/** A take keeps at least this many whole bars when it's interrupted (BOARD D6). */
export const MIN_INTERRUPTED_BARS = 2;

const listen = <T>(set: Set<T>) => (fn: T) => { set.add(fn); return () => { set.delete(fn); }; };

/** Which lane a feedback flash goes to. */
const laneOf = (d: string) => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d);
const extLaneOf = (d: string) => (d.startsWith('hh') ? 'hihat' : d);

export function createTake<O extends TakeOptions>(deps: TakeDeps, written: Chart, opts: O): Take<O> {
  const { clock, audio } = deps;
  const createdAt = clock.now(); // hits older than the take are queued strokes, never part of it (B25)
  const chart = expandForm(written); // a road map (N7) is played whole, bar by bar as written
  const options: O = written.form ? { ...opts, fromBar: 1, toBar: chart.bars } : opts;
  const ext = options.external;
  const bpb = beatsPerBar(chart);
  // A timed take is sized from its seconds; a flow is 64 bars, as on the web
  const secBars = options.toBar - options.fromBar + 1, secBeats = secBars * bpb;
  const endlessRepeats = options.seconds ? Math.ceil((options.seconds / 60) * chart.bpm * options.speed / secBeats) + 1 : Math.ceil(64 / secBars);
  const run = buildRun(chart, options.endless && !ext ? { ...options, repeats: endlessRepeats } : options);
  const split = splitRun(run, options.demo ? [] : options.activeLanes);
  const scored = ext ? run : split.scored, auto = ext ? [] : split.auto;
  const beatMs = toBeatMs(chart.bpm, options.speed);
  const isAuto = run.notes.map(() => false);
  auto.forEach(n => { isAuto[n.i] = true; });
  const endless = !!options.endless && !ext, wait = !!options.wait && !ext;

  const state: TakeState<O> = {
    phase: 'idle', chart, run, options, zero: 0, beatMs,
    results: run.notes.map(() => ({ judgement: 'miss' })), feedback: [], auto: isAuto, extraBeats: [],
    waitPos: -0.5, waitGroup: 0, waitLast: 0, route: null, missingWords: [], feed: null,
  };
  const finishFns = new Set<(f: Finished<O>) => void>(), endFns = new Set<(e: TakeEnd<O>) => void>();
  const cueFns = new Set<(c: Cue) => void>(), changeFns = new Set<() => void>();
  const setPhase = (p: TakeState['phase']) => { if (state.phase !== p) { state.phase = p; changeFns.forEach(f => f()); } };

  const hits: PlayedHit[] = [], extras: PlayedHit[] = [];
  let unsubscribe: (() => void) | undefined;
  let feeder: ReturnType<typeof createFeeder> | undefined;
  let startedAt = '', startedWall = 0, starting: Promise<void> | undefined;
  const wall = deps.wallClock ?? Date.now;

  // ---------- wait mode: advance to each group of notes and wait there until it's played ----------
  const groups: { t: number; idx: number[] }[] = [];
  run.notes.forEach((n, i) => {
    if (isAuto[i]) return;
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.t - n.t) < 1e-6) last.idx.push(i); else groups.push({ t: n.t, idx: [i] });
  });

  function position(now: number) {
    if (ext) return ext.position(now);
    if (wait) {
      if (state.phase !== 'playing') return state.waitPos;
      const target = state.waitGroup < groups.length ? groups[state.waitGroup].t : run.beats;
      state.waitPos = Math.min(target, state.waitPos + (now - state.waitLast) / beatMs);
      state.waitLast = now;
      return state.waitPos;
    }
    return (now - state.zero) / beatMs;
  }

  // ---------- live tips (engine/liveCoach.ts): once per bar, look at the last two bars and maybe give one tip ----------
  let live: { coach: ReturnType<typeof createLiveCoach>; bar: number; cues: Cue[] } | null = null;
  let expected: { time: number; drum: ChartDrum }[] = []; // the notes the student plays, on the hit clock
  function liveCheck(pos: number, now: number) {
    if (!live) return;
    const bar = Math.floor(pos / bpb);
    if (bar <= live.bar) return;
    live.bar = bar;
    const { results, zero } = state, from = (bar - 2) * bpb, to = bar * bpb;
    const notes = run.notes.flatMap((n, i) => (isAuto[i] || n.t < from || n.t >= to ? [] : [{ drum: n.drum, accent: n.accent, ghost: n.ghost, ...results[i] }]));
    const extraCount = extras.filter(h => { const b = (h.time - zero) / beatMs; return b >= from && b < to; }).length;
    // the feel this step asks for (R4): swing over the window, and the sheet's volume marks this bar vs the one before
    const inWin = run.notes.flatMap((n, i) => (isAuto[i] || n.t < from || n.t >= to ? [] : [i]));
    const swing = options.swingWant ? { now: swingPct({ ...run, notes: inWin.map(i => run.notes[i]) }, inWin.map(i => results[i]), beatMs), want: options.swingWant } : undefined;
    const marks = chart.dyn, markOf = (b: number) => marks?.[options.fromBar - 1 + (((b % secBars) + secBars) % secBars)];
    const vel = (b: number) => { const v = inWin.filter(i => run.notes[i].bar === b).flatMap(i => results[i].velocity ?? []); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0; };
    const dyn = marks && bar >= 2 && markOf(bar - 1) !== undefined && markOf(bar - 2) !== undefined ? { want: markOf(bar - 1)!, prevWant: markOf(bar - 2)!, got: vel(bar - 1), prevGot: vel(bar - 2) } : undefined;
    const raw = live.coach({ bar, notes, extras: extraCount, reaction: reactingToClick(expected, hits), target: options.feelTarget, swing, dyn: dyn && dyn.got && dyn.prevGot ? dyn : undefined });
    if (!raw) return;
    const cue = deps.wording ? deps.wording(chart, raw) : raw;
    state.cue = { cue, at: now };
    live.cues.push(cue);
    cueFns.forEach(l => l(cue));
  }

  // ---------- hits ----------
  function onWaitHit(h: Hit) {
    const hit = { time: h.time, pad: h.pad, velocity: h.velocity };
    hits.push(hit);
    const g = groups[state.waitGroup];
    if (!g) return;
    const idx = g.idx.find(i => state.results[i].judgement === 'miss' && h.pad && padMatches(run.notes[i].drum, h.pad));
    if (idx === undefined) {
      extras.push(hit);
      state.feedback.push({ lane: h.pad?.startsWith('hh') ? 'hihat' : (h.pad ?? 'snare'), judgement: 'extra', time: h.time });
      return;
    }
    state.results[idx] = { judgement: 'good', offset: 0, velocity: h.velocity, pad: h.pad };
    state.feedback.push({ lane: laneOf(run.notes[idx].drum), judgement: 'good', time: h.time });
    if (g.idx.every(i => state.results[i].judgement !== 'miss')) {
      state.waitGroup++;
      if (state.waitGroup >= groups.length) finish(scored, hits, extras, 'end');
    }
  }

  function listenTimed(latency: number) {
    const { zero } = state;
    // Each note's Good window comes from its own drum's spacing (noteWindows), not the tightest gap in the take.
    const match = createMatcher(noteWindows(scored.notes.map(n => ({ time: zero + n.t * beatMs, drum: n.drum, grace: n.grace, buzz: n.buzz })), options.goodMs), windowsFor(beatMs, Infinity, options.goodMs));
    const free = options.freeBars;
    return (h: Hit) => {
      const hit = { time: ext ? ext.position(h.time - latency) * beatMs : h.time - latency, pad: h.pad, velocity: h.velocity };
      const m = match(hit);
      if (!m && hit.time < zero) return; // count-in noodling isn't scored (an early first note still matches)
      hits.push(hit);
      if (m?.bounce) return; // a bounce of a buzz note: neither a note nor an extra
      if (m) {
        const i = scored.notes[m.index].i;
        state.results[i] = toResult(m, h.velocity, h.pad);
        state.feedback.push({ lane: (ext ? extLaneOf : laneOf)(run.notes[i].drum), judgement: m.judgement, time: h.time });
      } else if (h.pad && auto.some(n => padMatches(n.drum, h.pad!))) {
        // playing along on a lane the app is playing: neither scored nor an extra
      } else if (!ext && free && inFreeBar((hit.time - zero) / beatMs, bpb, options.fromBar, secBars, free)) {
        // your own bar: no ✕, no "extra" flash, no "only the notes shown" tip
      } else {
        extras.push(hit);
        state.extraBeats.push((hit.time - zero) / beatMs);
        state.feedback.push({ lane: extLaneOf(h.pad ?? 'snare'), judgement: 'extra', time: h.time });
      }
      if (state.feedback.length > 64) state.feedback.splice(0, 32);
    };
  }

  // ---------- start ----------
  async function prepareAudio(countVoice: boolean) {
    try {
      state.route = await audio.start();
    } catch (e) {
      state.route = audio.route();
      state.audioError = e instanceof Error ? e.message : String(e);
    }
    const words = planWords({ timeSignature: chart.timeSignature, countInBeats: options.countInBars * bpb, countVoice, countAloud: options.countAloud });
    if (!words.length) return;
    try {
      state.missingWords = (await audio.prepareWords(words)).missing;
    } catch {
      state.missingWords = words;
    }
  }

  function begin() {
    const s = deps.settings(), now = clock.now();
    startedWall = wall();
    startedAt = new Date(startedWall).toISOString();
    if (ext) {
      state.zero = 0;
    } else {
      const countIn = wait ? 0 : options.countInBars * bpb;
      state.zero = now + leadMs(audio) + countIn * beatMs;
      state.waitLast = now;
    }
    setPhase('playing');
    expected = run.notes.flatMap((n, i) => (isAuto[i] ? [] : [{ time: state.zero + n.t * beatMs, drum: n.drum }]));
    if (wait) {
      unsubscribe = deps.onHit(h => { if (h.time >= createdAt && state.phase === 'playing') onWaitHit(h); });
      return;
    }
    live = s.liveTips === 'off' || options.demo || options.guide ? null : { coach: createLiveCoach(s.chattiness), bar: 0, cues: [] };
    if (!options.demo) {
      const onTimed = listenTimed(s.latencyMs);
      unsubscribe = deps.onHit(h => { if (h.time >= createdAt && state.phase === 'playing') onTimed(h); });
    }
    if (ext) { ext.begin(); return; }
    const spec = planSpecFor(chart, run, auto, options, { zero: state.zero, beatMs, countVoice: s.countIn && !options.demo, missingWords: new Set(state.missingWords) });
    feeder = createFeeder(audio, spec, -spec.countInBeats);
    state.feed = feeder.stats;
    feeder.topUp(now, planEnd());
  }

  /** The plan never goes past the take's end (a timed endless take: its seconds). */
  const planEnd = () => (endless && options.seconds ? Math.min(run.beats, (options.seconds * 1000) / beatMs) : run.beats);

  // ---------- the end ----------
  function teardown() {
    unsubscribe?.(); unsubscribe = undefined;
    if (ext && state.phase === 'playing') ext.end();
  }

  function end(e: TakeEnd<O>) {
    endFns.forEach(f => f(e));
  }

  /** Results cover only the notes the student played (`scored`); a demo just ends. */
  function finish(take: Run, played: PlayedHit[], extra: PlayedHit[], reason: TakeEnd['reason'], interrupted = false) {
    teardown();
    if (options.demo) { setPhase('idle'); end({ reason, finished: null }); return; }
    const results = take.notes.map(n => state.results[n.i]);
    // the chart's volume marks per run bar (the section repeats), for the take's dynamics (R4)
    const dyn = chart.dyn && Array.from({ length: Math.ceil(take.beats / take.beatsPerBar) }, (_, b) => chart.dyn![options.fromBar - 1 + (b % secBars)]);
    const stats = { ...computeStats(take, results, extra.length, beatMs, dyn), reaction: options.wait ? null : reactingToClick(take.notes.map(n => ({ time: state.zero + n.t * beatMs, drum: n.drum })), played) };
    const finished: Finished<O> = {
      cues: live?.cues ?? [], zero: state.zero, chart, run: take, options, results, extras: extra, hits: played, stats, startedAt,
      durationS: Math.round((wall() - startedWall) / 1000), ...(interrupted && { interrupted: true as const }),
    };
    state.finished = finished;
    setPhase('done');
    finishFns.forEach(f => f(finished));
    end({ reason, finished });
  }

  /** Ends at the last whole bar played: the stop of an endless take, and an interruption. */
  function finishWholeBars(at: number, reason: TakeEnd['reason'], interrupted: boolean) {
    const beats = Math.min(run.beats, Math.max(0, Math.floor(position(at) / bpb)) * bpb), endAt = state.zero + beats * beatMs;
    // the 4-crash stop and anything after the last whole bar isn't part of the take
    const take = { ...scored, notes: scored.notes.filter(n => n.t < beats), beats };
    if (interrupted && (beats / bpb < MIN_INTERRUPTED_BARS || !take.notes.length)) return drop(reason);
    finish(take, hits.filter(h => h.time < endAt), extras.filter(h => h.time < endAt), reason, interrupted);
  }

  function drop(reason: TakeEnd['reason']) {
    teardown();
    setPhase('idle');
    end({ reason, finished: null });
  }

  return {
    state,
    position,
    start() {
      if (starting) return starting;
      setPhase('starting');
      const s = deps.settings();
      starting = (ext || wait ? Promise.resolve() : prepareAudio(s.countIn && !options.demo)).then(() => {
        if (state.phase === 'starting') begin(); // not stopped while the audio was starting
      });
      return starting;
    },
    tick(now) {
      if (state.phase !== 'playing' || wait) return;
      if (ext) {
        const pos = ext.position(now);
        liveCheck(pos, now);
        if (pos > run.beats + 0.5) finish(run, hits, extras, 'end');
        return;
      }
      feeder!.topUp(now, planEnd());
      liveCheck(position(now), now);
      if (endless && options.seconds && now > state.zero + options.seconds * 1000) { finishWholeBars(now, 'end', false); return; }
      if (now > state.zero + run.beats * beatMs + 400) finish(scored, hits, extras, 'end');
    },
    stop(reason = 'user', at) {
      if (state.phase === 'starting') { drop(reason); return; }
      if (state.phase !== 'playing') return;
      if (feeder) audio.cancel();
      const now = at ?? clock.now();
      if (reason === 'interrupted' && !wait && !options.demo) finishWholeBars(now, reason, true);
      else if (reason === 'user' && endless) finishWholeBars(now, reason, false);
      else drop(reason);
    },
    onFinish: listen(finishFns),
    onEnd: listen(endFns),
    onCue: listen(cueFns),
    onChange: listen(changeFns),
  };
}
