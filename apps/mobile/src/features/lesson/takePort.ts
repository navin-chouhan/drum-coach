// TakePort on core's take engine (createTake, A4p2): one core take per start, the web player's module API on top,
// and the results stream the play surfaces need (core keeps results in arrays; this turns their changes into events).
import type { Chart } from '@drum-coach/core/engine/chart';
import type { Cue } from '@drum-coach/core/engine/liveCoach';
import { WINDOWS } from '@drum-coach/core/engine/scoring';
import type { Hit } from '@drum-coach/core/input/hits';
import type { AudioPort } from '@drum-coach/core/play/audioPort';
import { createTake, type Take, type TakeSettings } from '@drum-coach/core/play/take';
import type { Clock } from '@drum-coach/core/platform';
import { laneOf, PAD_DRUM } from '../../play/chartLike';
import { createStream, type PlayResult } from '../../play/events';
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
};

export type CoreTakePort = TakePort & {
  /** Call ~10×/s (and/or every frame): plans sounds, gives live tips, ends the take, reports missed notes. */
  tick(now?: number): void;
  /** How the last take ended: 'dropped' when an interruption ended it before 2 whole bars (D6). */
  readonly lastEnd: 'end' | 'user' | 'interrupted' | 'dropped' | undefined;
};

const IDLE: TakeState = { phase: 'idle', zero: 0, beatMs: 500, results: [], feedback: [], auto: [], extraBeats: [] };

export function createTakePort(deps: TakePortDeps): CoreTakePort {
  let take: Take<PlayOptions> | undefined;
  let offs: (() => void)[] = [];
  let lastEnd: CoreTakePort['lastEnd'];
  let snapshot: unknown[] = [], extrasSeen = 0, missAt = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(l => l());
  const stream = createStream<PlayResult>();

  /** After each stroke: the notes it judged and the extra it made, as events. */
  function diff(h: Hit) {
    const s = take?.state;
    if (!s || s.phase !== 'playing') return;
    s.results.forEach((r, i) => {
      if (r === snapshot[i]) return;
      snapshot[i] = r;
      if (r.judgement === 'miss' && r.off === undefined) return;
      stream.emit({ kind: 'judged', index: i, lane: laneOf(s.run.notes[i].drum), judgement: r.judgement, offsetMs: r.offset ?? r.off, at: h.time, pad: r.pad });
    });
    for (; extrasSeen < s.extraBeats.length; extrasSeen++) if (h.pad) stream.emit({ kind: 'extra', lane: PAD_DRUM[h.pad], at: h.time, pad: h.pad });
  }
  /** Notes nobody played: missed once their window has passed. */
  function misses(now: number) {
    const s = take?.state;
    if (!s || s.phase !== 'playing' || s.options.wait || s.options.demo) return;
    const latency = deps.settings().latencyMs;
    for (; missAt < s.run.notes.length && s.zero + s.run.notes[missAt].t * s.beatMs + WINDOWS.near < now - latency; missAt++) {
      const r = s.results[missAt];
      if (!s.auto[missAt] && r.judgement === 'miss' && r.off === undefined) stream.emit({ kind: 'judged', index: missAt, lane: laneOf(s.run.notes[missAt].drum), judgement: 'miss', at: now });
    }
  }

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
        onHit: fn => deps.onHit(h => { fn(h); diff(h); }),
      }, chart, options);
      take = t;
      snapshot = t.state.results.slice(); extrasSeen = 0; missAt = 0;
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
      void t.start();
      notify();
    },
    stop(reason = 'user') {
      const t = take;
      if (!t) return;
      t.stop(reason);
      // a dropped take leaves nothing on screen; a finished one stays (phase done)
      if (t.state.phase === 'idle') notify();
    },
    position(now = deps.clock.now()) { return take ? take.position(now) : 0; },
    tick(now = deps.clock.now()) { take?.tick(now); misses(now); },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    results: stream.subscribe,
  };
}
