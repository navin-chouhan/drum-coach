// TakePort on core's take engine (createTake, A4p2): one core take per start, the web player's module API on top,
// and the results stream the play surfaces need (core keeps results in arrays; this turns their changes into events).
import type { Chart } from '@drum-coach/core/engine/chart';
import type { Cue } from '@drum-coach/core/engine/liveCoach';
import { WINDOWS } from '@drum-coach/core/engine/scoring';
import type { Hit } from '@drum-coach/core/input/hits';
import type { AudioPort } from '@drum-coach/core/play/audioPort';
import { createTake, type Take, type TakeOptions, type TakeSettings, type TakeState as CoreTakeState } from '@drum-coach/core/play/take';
import type { Clock } from '@drum-coach/core/platform';
import { laneOf, PAD_DRUM } from '../../play/chartLike';
import { createStream, type PlayResult } from '../../play/events';
import { startWithSpokenFallback } from '../../play/spokenFallback';
import type { PlayOptions, TakePort, TakeState } from './types';

export type TakePortDeps = {
  clock: Clock;
  audio: AudioPort;
  onHit: (fn: (h: Hit) => void) => () => void;
  settings: () => TakeSettings;
  /** The coach's wording for a live tip (A7e tips.wordingFor). */
  wording?: (chart: Chart, cue: Cue) => Cue;
  wallClock?: () => number;
  /** Every live tip as it's given (the voice). */
  onCue?: (c: Cue) => void;
  /** Says one count-in word live (the system voice) when the engine couldn't render it. */
  sayWord?: (word: string) => void;
};

export type CoreTakePort = TakePort & {
  /** Call ~10×/s (and/or every frame): plans sounds, gives live tips, ends the take, reports missed notes. */
  tick(now?: number): void;
  /** How the last take ended: 'dropped' when an interruption ended it before 2 whole bars (D6). */
  readonly lastEnd: 'end' | 'user' | 'interrupted' | 'dropped' | undefined;
};

const IDLE: TakeState = { phase: 'idle', zero: 0, beatMs: 500, results: [], feedback: [], auto: [], extraBeats: [] };

/**
 * A take's results as events (core keeps them in arrays): the notes each stroke judged, the extra strokes, and misses
 * once a note's window has passed. The lesson player's TakePort and Practice's engine both feed the play surfaces
 * (highway, sheet, kit view) with it. Call reset at each new take, afterHit after core has judged a stroke, and
 * misses on each tick.
 */
export function createResultsFeed(latencyMs: () => number) {
  const stream = createStream<PlayResult>();
  let snapshot: unknown[] = [], extrasSeen = 0, missAt = 0;
  return {
    subscribe: stream.subscribe,
    reset(s: Pick<CoreTakeState, 'results'>) { snapshot = s.results.slice(); extrasSeen = 0; missAt = 0; },
    /** After each stroke: the notes it judged and the extra it made, as events. */
    afterHit<O extends TakeOptions>(s: CoreTakeState<O> | undefined, h: Hit) {
      if (!s || s.phase !== 'playing') return;
      s.results.forEach((r, i) => {
        if (r === snapshot[i]) return;
        snapshot[i] = r;
        if (r.judgement === 'miss' && r.off === undefined) return;
        stream.emit({ kind: 'judged', index: i, lane: laneOf(s.run.notes[i].drum), judgement: r.judgement, offsetMs: r.offset ?? r.off, at: h.time, pad: r.pad });
      });
      for (; extrasSeen < s.extraBeats.length; extrasSeen++) if (h.pad) stream.emit({ kind: 'extra', lane: PAD_DRUM[h.pad], at: h.time, pad: h.pad });
    },
    /** Notes nobody played: missed once their window has passed. */
    misses<O extends TakeOptions>(s: CoreTakeState<O> | undefined, now: number) {
      if (!s || s.phase !== 'playing' || s.options.wait || s.options.demo) return;
      const latency = latencyMs();
      for (; missAt < s.run.notes.length && s.zero + s.run.notes[missAt].t * s.beatMs + WINDOWS.near < now - latency; missAt++) {
        const r = s.results[missAt];
        if (!s.auto[missAt] && r.judgement === 'miss' && r.off === undefined) stream.emit({ kind: 'judged', index: missAt, lane: laneOf(s.run.notes[missAt].drum), judgement: 'miss', at: now });
      }
    },
  };
}

export function createTakePort(deps: TakePortDeps): CoreTakePort {
  let take: Take<PlayOptions> | undefined;
  let offs: (() => void)[] = [];
  let lastEnd: CoreTakePort['lastEnd'];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());
  const feed = createResultsFeed(() => deps.settings().latencyMs);

  const view = (): TakeState => {
    const s = take?.state;
    if (!s) return IDLE;
    return { ...s, phase: s.phase === 'starting' ? 'playing' : s.phase };
  };

  function drop() {
    offs.forEach(f => f()); offs = [];
    const t = take;
    take = undefined;
    t?.stop('user');
  }

  return {
    get state() { return view(); },
    get lastEnd() { return lastEnd; },
    start(chart, options) {
      drop();
      lastEnd = undefined;
      const t = createTake<PlayOptions>({
        clock: deps.clock, audio: deps.audio, settings: deps.settings, wording: deps.wording, wallClock: deps.wallClock,
        onHit: fn => deps.onHit(h => { fn(h); feed.afterHit(take?.state, h); }),
      }, chart, options);
      take = t;
      feed.reset(t.state);
      offs = [
        t.onChange(notify),
        t.onCue(c => { deps.onCue?.(c); notify(); }),
        t.onEnd(e => {
          if (take !== t) return;
          lastEnd = e.reason === 'interrupted' && !e.finished ? 'dropped' : e.reason;
          if (options.demo && e.reason === 'end') options.then?.();
          notify();
        }),
      ];
      // the count-in words the engine couldn't render are said live (play/spokenFallback.ts)
      void startWithSpokenFallback(t, { countVoice: deps.settings().countIn, now: () => deps.clock.now(), say: w => deps.sayWord?.(w), setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: h => clearTimeout(h as ReturnType<typeof setTimeout>) }).catch(() => {});
      notify();
    },
    stop(reason = 'user', at) {
      const t = take;
      if (!t) return;
      t.stop(reason, at);
      // a dropped take leaves nothing on screen; a finished one stays (phase done)
      if (t.state.phase === 'idle') notify();
    },
    position(now = deps.clock.now()) { return take ? take.position(now) : 0; },
    tick(now = deps.clock.now()) { take?.tick(now); feed.misses(take?.state, now); },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    results: feed.subscribe,
  };
}
