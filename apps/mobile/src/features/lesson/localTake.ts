// A TakePort on the Clock, scored exactly as src/play/player.ts scores (core matcher, windows, stats, live tips), for
// the lesson player until core's createTake (A4p2) is merged; then ./takePort.ts binds that instead. It hands sounds
// to a `sound` sink (AudioPort events, heard Clock times) planned ahead on `tick`, like the web's lookahead loop.
// Not ported (createTake's job): the band, count-aloud words, drift smoothing.
import { beatsPerBar, DRUM_PAD, padMatches, type Chart } from '@drum-coach/core/engine/chart';
import { feelNow } from './feel';
import { expandForm } from '@drum-coach/core/engine/form';
import { inFreeBar } from '@drum-coach/core/engine/jam';
import { clickOnBeat } from '@drum-coach/core/engine/lesson';
import { createLiveCoach, type Chattiness, type Cue } from '@drum-coach/core/engine/liveCoach';
import { groupStarts, isOdd8 } from '@drum-coach/core/engine/meter';
import { buildRun, splitRun, beatMs as toBeatMs, type Run, type RunNote } from '@drum-coach/core/engine/run';
import { computeStats, createMatcher, noteWindows, reactingToClick, toResult, windowsFor, type PlayedHit } from '@drum-coach/core/engine/scoring';
import type { Hit } from '@drum-coach/core/input/hits';
import type { AudioEvent, SoundId } from '@drum-coach/core/play/audioPort';
import type { Clock } from '@drum-coach/core/platform';
import { createStream, type PlayResult } from '../../play/events';
import { laneOf, PAD_DRUM } from '../../play/chartLike';
import { WINDOWS } from '@drum-coach/core/engine/scoring';
import type { Finished, PlayOptions, TakePort, TakeState } from './types';

export type LocalTakeDeps = {
  clock: Clock;
  onHit: (fn: (h: Hit) => void) => () => void;
  /** Settings read at each start: latency, live tips, the spoken count-in. */
  settings: () => { latencyMs: number; liveTips: 'off' | 'screen' | 'voice'; chattiness: Chattiness; countIn: boolean };
  /** Sounds planned ahead (heard Clock ms). Optional: without it the take is silent. */
  sound?: { schedule(events: AudioEvent[]): void; cancel(): void };
  /** Lead before the first count-in click (AUDIO-DESIGN §2.3: 300 ms on iOS). */
  leadMs?: number;
  /** Wall clock ISO time for startedAt. */
  wallNow?: () => Date;
  /** Every live tip as it's given (the voice). */
  onCue?: (c: Cue) => void;
};

const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const PLAN_AHEAD_MS = 2000;

export type LocalTake = TakePort & {
  /** Call ~10×/s (and/or every frame): plans sounds, gives live tips, ends the take. */
  tick(now?: number): void;
};

export function createLocalTake(deps: LocalTakeDeps): LocalTake {
  const state: TakeState = { phase: 'idle', zero: 0, beatMs: 500, results: [], feedback: [], auto: [], extraBeats: [] };
  const listeners = new Set<() => void>();
  const stream = createStream<PlayResult>();
  const notify = () => listeners.forEach(l => l());
  let cleanup: (() => void)[] = [];
  let ticker: ((now: number) => void) | undefined;
  let endEarly: ((reason: 'user' | 'interrupted') => void) | undefined;
  let wait = { pos: 0, group: 0, last: 0, groups: [] as { t: number; idx: number[] }[] };

  function clear() { cleanup.forEach(f => f()); cleanup = []; ticker = undefined; deps.sound?.cancel(); }

  function finish(scored: Run, hits: PlayedHit[], extras: PlayedHit[], startedAt: Date, cues: Cue[], interrupted?: { reason?: string }) {
    endEarly = undefined;
    const { chart, options } = state;
    if (options!.demo) { clear(); state.phase = 'idle'; notify(); options!.then?.(); return; }
    clear();
    const results = scored.notes.map(n => state.results[n.i]);
    const secBars = options!.toBar - options!.fromBar + 1;
    const dyn = chart!.dyn && Array.from({ length: Math.ceil(scored.beats / scored.beatsPerBar) }, (_, b) => chart!.dyn![options!.fromBar - 1 + (b % secBars)]);
    const stats = { ...computeStats(scored, results, extras.length, state.beatMs, dyn), reaction: options!.wait ? null : reactingToClick(scored.notes.map(n => ({ time: state.zero + n.t * state.beatMs, drum: n.drum })), hits) };
    const end = deps.wallNow?.() ?? new Date();
    const f: Finished = { cues, zero: state.zero, chart: chart!, run: scored, options: options!, results, extras, hits, stats,
      startedAt: startedAt.toISOString(), durationS: Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 1000)), ...(interrupted && { interrupted }) };
    state.phase = 'done';
    state.finished = f;
    notify();
  }

  function position(now = deps.clock.now()) {
    if (state.options?.wait && state.run) {
      const target = wait.group < wait.groups.length ? wait.groups[wait.group].t : state.run.beats;
      wait.pos = Math.min(target, wait.pos + (now - wait.last) / state.beatMs);
      wait.last = now;
      return wait.pos;
    }
    return (now - state.zero) / state.beatMs;
  }

  function start(written: Chart, opts: PlayOptions) {
    const chart = expandForm(written);
    const options = written.form ? { ...opts, fromBar: 1, toBar: chart.bars } : opts;
    endEarly = undefined;
    clear();
    const s = deps.settings(), now = deps.clock.now(), startedAt = deps.wallNow?.() ?? new Date();
    const secBars = options.toBar - options.fromBar + 1, bpb = beatsPerBar(chart), secBeats = secBars * bpb;
    const endlessRepeats = options.seconds ? Math.ceil((options.seconds / 60) * chart.bpm * options.speed / secBeats) + 1 : Math.ceil(64 / secBars);
    const run = buildRun(chart, options.endless ? { ...options, repeats: endlessRepeats } : options);
    const { scored, auto } = splitRun(run, options.demo ? [] : options.activeLanes);
    const isAuto = run.notes.map(() => false);
    auto.forEach(n => { isAuto[n.i] = true; });
    const beatMs = toBeatMs(chart.bpm, options.speed);
    const countIn = options.wait ? 0 : options.countInBars * bpb;
    const t0 = now + (deps.leadMs ?? 300);
    const zero = t0 + countIn * beatMs;
    Object.assign(state, {
      phase: 'playing', chart, run, options, beatMs, zero,
      results: run.notes.map(() => ({ judgement: 'miss' })), feedback: [], auto: isAuto, cue: undefined, extraBeats: [], finished: undefined,
    } satisfies Partial<TakeState>);
    const hits: PlayedHit[] = [], extras: PlayedHit[] = [], cues: Cue[] = [];
    const fbLane = (d: string) => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d);

    if (options.wait) {
      const groups: { t: number; idx: number[] }[] = [];
      run.notes.forEach((n, i) => {
        if (isAuto[i]) return;
        const last = groups[groups.length - 1];
        if (last && Math.abs(last.t - n.t) < 1e-6) last.idx.push(i); else groups.push({ t: n.t, idx: [i] });
      });
      wait = { pos: -0.5, group: 0, last: now, groups };
      cleanup.push(deps.onHit(h => {
        if (h.time < now) return; // queued strokes from before this take (AUDIO-DESIGN §4, B25)
        const hit = { time: h.time, pad: h.pad, velocity: h.velocity };
        hits.push(hit);
        const g = groups[wait.group];
        if (!g) return;
        const idx = g.idx.find(i => state.results[i].judgement === 'miss' && h.pad && padMatches(run.notes[i].drum, h.pad));
        if (idx === undefined) {
          extras.push(hit);
          state.feedback.push({ lane: h.pad?.startsWith('hh') ? 'hihat' : (h.pad ?? 'snare'), judgement: 'extra', time: h.time });
          if (h.pad) stream.emit({ kind: 'extra', lane: PAD_DRUM[h.pad], at: h.time, pad: h.pad });
          return;
        }
        state.results[idx] = { judgement: 'good', offset: 0, velocity: h.velocity, pad: h.pad };
        stream.emit({ kind: 'judged', index: idx, lane: laneOf(run.notes[idx].drum), judgement: 'good', offsetMs: 0, at: h.time, pad: h.pad });
        state.feedback.push({ lane: fbLane(run.notes[idx].drum), judgement: 'good', time: h.time });
        if (g.idx.every(i => state.results[i].judgement !== 'miss')) {
          wait.group++;
          if (wait.group >= groups.length) finish(scored, hits, extras, startedAt, cues);
        }
      }));
      endEarly = () => { clear(); state.phase = 'idle'; notify(); }; // wait mode stops and isn't kept
      notify();
      return;
    }

    const latency = s.latencyMs;
    const match = createMatcher(noteWindows(scored.notes.map(n => ({ time: zero + n.t * beatMs, drum: n.drum, grace: n.grace, buzz: n.buzz })), options.goodMs), windowsFor(beatMs, Infinity, options.goodMs));
    if (!options.demo) cleanup.push(deps.onHit(h => {
      if (h.time < now) return;
      const hit = { time: h.time - latency, pad: h.pad, velocity: h.velocity };
      const m = match(hit);
      if (!m && hit.time < zero) return; // count-in noodling isn't scored
      hits.push(hit);
      if (m?.bounce) return;
      if (m) {
        const i = scored.notes[m.index].i;
        state.results[i] = toResult(m, h.velocity, h.pad);
        state.feedback.push({ lane: fbLane(run.notes[i].drum), judgement: m.judgement, time: h.time });
        stream.emit({ kind: 'judged', index: i, lane: laneOf(run.notes[i].drum), judgement: m.judgement, offsetMs: m.offset, at: h.time, pad: h.pad });
      } else if (h.pad && auto.some(n => padMatches(n.drum, h.pad!))) {
        // playing along on a lane the app plays
      } else if (options.freeBars && inFreeBar((hit.time - zero) / beatMs, bpb, options.fromBar, secBars, options.freeBars)) {
        // your own bar
      } else {
        extras.push(hit);
        state.extraBeats.push((hit.time - zero) / beatMs);
        const pad = h.pad ?? 'snare';
        state.feedback.push({ lane: pad.startsWith('hh') ? 'hihat' : pad, judgement: 'extra', time: h.time });
        stream.emit({ kind: 'extra', lane: PAD_DRUM[pad], at: h.time, pad });
      }
      if (state.feedback.length > 64) state.feedback.splice(0, 32);
    }));

    // Live tips (engine/liveCoach.ts): once per bar on the last two bars.
    const live = s.liveTips === 'off' || options.demo || options.guide ? null : { coach: createLiveCoach(s.chattiness), bar: 0 };
    const expected = run.notes.flatMap((n, i) => (isAuto[i] ? [] : [{ time: zero + n.t * beatMs, drum: n.drum }]));
    function liveCheck(pos: number, at: number) {
      if (!live) return;
      const bar = Math.floor(pos / bpb);
      if (bar <= live.bar) return;
      live.bar = bar;
      const from = (bar - 2) * bpb, to = bar * bpb;
      const inWin = run.notes.flatMap((n, i) => (isAuto[i] || n.t < from || n.t >= to ? [] : [i]));
      const notes = inWin.map(i => ({ drum: run.notes[i].drum, accent: run.notes[i].accent, ghost: run.notes[i].ghost, ...state.results[i] }));
      const nExtras = extras.filter(h => { const b = (h.time - zero) / beatMs; return b >= from && b < to; }).length;
      const feel = feelNow(run, inWin, state.results, beatMs, options, chart.dyn, bar);
      const cue = live.coach({ bar, notes, extras: nExtras, reaction: reactingToClick(expected, hits), target: options.feelTarget, ...feel });
      if (!cue) return;
      state.cue = { cue, at };
      cues.push(cue);
      deps.onCue?.(cue);
      notify();
    }

    // The sound plan: clicks (count-in always, odd /8 in 8ths), spoken count-in, app-played notes.
    const odd8 = isOdd8(chart.timeSignature), n8 = chart.timeSignature[0], starts = groupStarts(chart.timeSignature);
    const sub = odd8 ? 2 : options.clickOn === '8ths' ? 2 : options.subdivision;
    const sounding = options.guide ? run.notes : auto;
    const lastK = options.metronome ? run.beats * sub : 0;
    const timeOf = (k: number) => t0 + (k / sub + countIn) * beatMs;
    const countVoice = s.countIn && !options.demo;
    let k = -countIn * sub, a = 0;
    const clickSound = (level: 0 | 1 | 2): SoundId => (level === 0 ? 'click.bar' : level === 1 ? 'click.beat' : 'click.sub');
    function plan(until: number) {
      const ev: AudioEvent[] = [];
      for (; k < lastK && timeOf(k) < until; k++) {
        const at = timeOf(k);
        if (odd8) {
          const p = ((k % n8) + n8) % n8, bar8 = Math.floor(k / n8);
          if (k < 0 && countVoice) ev.push({ kind: 'sound', at, sound: `word.${NUMBERS[p]}`, gain: 1 });
          const gap8 = options.gapBars && k >= 0 && (bar8 + 1) % options.gapBars === 0, vol8 = options.fadeClick && k >= 0 ? Math.max(0, 1 - bar8 / options.fadeClick) : 1;
          if (!gap8 && vol8 > 0 && options.metronome) ev.push({ kind: 'sound', at, sound: clickSound(p === 0 ? 0 : starts.has(p) ? 1 : 2), gain: vol8 });
          continue;
        }
        const onBeat = k % sub === 0;
        const inBar = (((k / sub) % bpb) + bpb) % bpb;
        if (k < 0 && onBeat && countVoice) ev.push({ kind: 'sound', at, sound: `word.${NUMBERS[Math.floor(inBar + 1e-6)]}`, gain: 1 });
        const barNo = Math.floor(k / sub / bpb + 1e-6);
        const gap = options.gapBars && k >= 0 && (barNo + 1) % options.gapBars === 0;
        const vol = options.fadeClick && k >= 0 ? Math.max(0, 1 - barNo / options.fadeClick) : 1;
        const feel = k < 0 || !onBeat || clickOnBeat(Math.round(inBar), options.clickOn);
        if (!gap && vol > 0 && feel) ev.push({ kind: 'sound', at, sound: clickSound(!onBeat ? 2 : inBar < 1e-6 ? 0 : 1), gain: vol });
      }
      const autoAt = (n: RunNote) => zero + n.t * beatMs;
      for (; a < sounding.length && autoAt(sounding[a]) < until; a++) {
        const n = sounding[a];
        ev.push({ kind: 'sound', at: autoAt(n), sound: `drum.${DRUM_PAD[n.drum][0]}`, gain: ((n.accent ? 110 : n.ghost ? 40 : 80) * (options.guide ? 0.5 : 1)) / 127 });
      }
      if (ev.length) deps.sound?.schedule(ev);
    }
    plan(now + PLAN_AHEAD_MS * 2);

    // A note nobody played: missed once its window (WINDOWS.near) has passed.
    let missAt = 0;
    const missed = (at: number) => {
      for (; missAt < scored.notes.length && zero + scored.notes[missAt].t * beatMs + WINDOWS.near < at - latency; missAt++) {
        const i = scored.notes[missAt].i, r = state.results[i];
        if (r.judgement === 'miss' && r.off === undefined) stream.emit({ kind: 'judged', index: i, lane: laneOf(run.notes[i].drum), judgement: 'miss', at });
      }
    };
    ticker = at => {
      plan(at + PLAN_AHEAD_MS);
      if (!options.demo) missed(at);
      liveCheck(position(at), at);
      if (options.seconds && at > zero + options.seconds * 1000) { endEarly?.('user'); return; }
      if (at > zero + run.beats * beatMs + 400) finish(scored, hits, extras, startedAt, cues);
    };
    // An endless take (or any take interrupted, D6) ends with the whole bars played so far.
    endEarly = reason => {
      const beats = Math.max(0, Math.floor(position() / bpb)) * bpb, end = zero + beats * beatMs;
      finish({ ...scored, notes: scored.notes.filter(n => n.t < beats), beats }, hits.filter(h => h.time < end), extras.filter(h => h.time < end), startedAt, cues,
        reason === 'interrupted' ? {} : undefined);
    };
    notify();
  }

  return {
    state,
    start,
    position,
    tick(now = deps.clock.now()) { if (state.phase === 'playing') ticker?.(now); },
    stop(reason = 'user') {
      if (state.phase === 'playing' && endEarly && !state.options?.demo && (state.options?.endless || state.options?.wait || reason === 'interrupted')) { const end = endEarly; endEarly = undefined; end(reason); return; }
      endEarly = undefined;
      clear();
      if (state.phase !== 'idle') { state.phase = 'idle'; notify(); }
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    results: stream.subscribe,
  };
}
