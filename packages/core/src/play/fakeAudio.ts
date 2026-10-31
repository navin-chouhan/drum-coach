// A fake AudioPort and Clock for tests (core, and the apps' own take tests): it records what was handed over, drops
// events that are already too late (heard before now + minLeadMs) as native does, and keeps them per heard time.
import type { Clock } from '../platform.ts';
import type { AudioEvent, AudioInterruption, AudioPort, AudioRoute, BackingPort, BackingSegment } from './audioPort.ts';

export type FakeClock = Clock & { t: number; set(t: number): void; advance(ms: number): void };

export function createFakeClock(t = 0): FakeClock {
  const c: FakeClock = { t, now: () => c.t, set: x => { c.t = x; }, advance: ms => { c.t += ms; } };
  return c;
}

export const SPEAKER: AudioRoute = { key: 'Speaker', kind: 'speaker', name: 'Speaker', outputLatencyMs: 5.7, ioBufferMs: 21.3, sampleRate: 48000, heardOffsetMs: 5.7, minLeadMs: 37 };

export type FakeAudioPort = AudioPort & {
  /** Every event accepted and not cancelled, in hand-over order. */
  events: AudioEvent[];
  /** Every schedule call: when, and what it held. */
  calls: { now: number; events: AudioEvent[] }[];
  cancels: { now: number; fromMs?: number }[];
  /** Words prepareWords reports missing. */
  missing: Set<string>;
  /** Makes start() reject (no module). */
  fail?: string;
  emitInterruption(e: AudioInterruption): void;
};

/** A start's line (its length, if any, shows in `heard()`). */
export type BackingStart = { now: number; at: number; offsetMs: number; rate: number };
export type BackingQueue = BackingSegment & { now: number };
/** A stretch of the file heard: from `at` (Clock ms), file ms `offsetMs` on, at `rate`, until `until` (Clock ms). */
export type HeardSegment = { at: number; offsetMs: number; rate: number; until: number };

export type FakeBackingPort = BackingPort & {
  loads: string[];
  starts: BackingStart[];
  queues: BackingQueue[];
  /** Clock times of every stop(). */
  stops: number[];
  /** Makes load() reject with this message. */
  fail?: string;
  /** The device's rate error: the file plays (1 + ppm × 1e-6) × faster than the Clock says (AUDIO-DESIGN §6). */
  ppm: number;
  /** The file position heard at Clock time t (null when nothing is heard then): the true song line. */
  heardAt(t: number): number | null;
  /** Every stretch of the file heard so far or planned, in order (as Clock times at ppm 0). */
  heard(): HeardSegment[];
};

/** One segment on a run's player timeline: from player position `p` (file ms of the run), file ms `fileMs` on, `durMs` long. */
type Seg = { p: number; fileMs: number; durMs: number };
/** One start: its player timeline runs from Clock `t0` at rate × (1 + ppm), `from` the start call `until` a start or stop cut it. */
type Run = { t0: number; rate: number; from: number; until: number; segs: Seg[] };

/**
 * A fake backing player, as native's BackingPlayer behaves: a start cuts what's playing at once and is heard from
 * `at` (a negative offset waits −offset / rate first); queued segments follow back to back on the same player
 * timeline (a later `at` waits, an earlier one skips into the file). The timeline runs at rate × (1 + ppm) until the
 * segments, the file or a stop end. `anchor()` reads the heard position at the Clock's now (null when nothing is heard).
 */
export function createFakeBackingPort(clock: Clock, o: { durationMs?: number; ppm?: number } = {}): FakeBackingPort {
  const durationMs = o.durationMs ?? 600_000;
  const runs: Run[] = [];
  let run: Run | null = null;
  /** The segment `{at, offsetMs, durationMs}` on run `r`, after `prevEnd` (player ms); null when nothing of it is left. */
  const place = (r: Run, at: number, offsetMs: number, dur: number, prevEnd: number): Seg | null => {
    const lead = Math.max(0, -offsetMs), want = (at - r.t0) * r.rate + lead;
    const p = Math.abs(want - prevEnd) < 1e-6 ? prevEnd : Math.max(want, prevEnd), skip = p - want;
    const fileMs = Math.max(0, offsetMs) + skip, durMs = Math.min(dur - lead - skip, durationMs - fileMs);
    return durMs > 0 ? { p, fileMs, durMs } : null;
  };
  const cut = (now: number) => { if (run) run.until = Math.min(run.until, now); };
  const b: FakeBackingPort = {
    loads: [], starts: [], queues: [], stops: [], ppm: o.ppm ?? 0,
    load(uri) {
      b.loads.push(uri);
      return b.fail ? Promise.reject(new Error(b.fail)) : Promise.resolve({ durationMs, sampleRate: 44100 });
    },
    start({ at, offsetMs, rate, durationMs: dur }) {
      const now = clock.now();
      b.starts.push({ now, at, offsetMs, rate });
      cut(now);
      run = { t0: at, rate, from: now, until: Infinity, segs: [] };
      runs.push(run);
      const s = place(run, at, offsetMs, dur ?? Infinity, 0);
      if (s) run.segs.push(s);
    },
    queue({ at, offsetMs, durationMs: dur }) {
      b.queues.push({ now: clock.now(), at, offsetMs, durationMs: dur });
      if (!run) return;
      const last = run.segs[run.segs.length - 1];
      const s = place(run, at, offsetMs, dur, last ? last.p + last.durMs : 0);
      if (s) run.segs.push(s);
    },
    stop() {
      const now = clock.now();
      b.stops.push(now);
      cut(now);
      run = null;
    },
    heardAt(t) {
      for (let i = runs.length - 1; i >= 0; i--) {
        const r = runs[i];
        if (t < r.from || t >= r.until) continue;
        const p = (t - r.t0) * r.rate * (1 + b.ppm * 1e-6), s = r.segs.find(x => p >= x.p && p < x.p + x.durMs);
        return s ? s.fileMs + (p - s.p) : null;
      }
      return null;
    },
    heard() {
      return runs.flatMap(r => r.segs.map(s => ({ at: r.t0 + s.p / r.rate, offsetMs: s.fileMs, rate: r.rate, until: Math.min(r.t0 + (s.p + s.durMs) / r.rate, r.until) })));
    },
    anchor() {
      const now = clock.now(), fileMs = b.heardAt(now);
      return fileMs === null ? null : { at: now, fileMs };
    },
  };
  return b;
}

export function createFakeAudioPort(clock: Clock, route: AudioRoute | null = SPEAKER, backing: BackingPort | null = null): FakeAudioPort {
  let current: AudioRoute | null = null;
  const routeFns = new Set<(r: AudioRoute) => void>(), interruptFns = new Set<(e: AudioInterruption) => void>();
  const totals = { scheduled: 0, late: 0, dropped: 0, engineStarts: 0 };
  const port: FakeAudioPort = {
    available: route !== null,
    clock,
    events: [], calls: [], cancels: [], missing: new Set(),
    start() {
      if (port.fail || !route) return Promise.reject(new Error(port.fail ?? 'no audio'));
      if (current !== route) { current = route; totals.engineStarts++; routeFns.forEach(f => f(route)); }
      return Promise.resolve(route);
    },
    suspend() { current = null; },
    route: () => current,
    prepareWords: words => Promise.resolve({ missing: words.filter(w => port.missing.has(w)) }),
    schedule(events) {
      const now = clock.now(), lead = current?.minLeadMs ?? 0;
      port.calls.push({ now, events });
      const ok = events.filter(e => e.at >= now + lead);
      port.events.push(...ok);
      totals.scheduled += ok.length;
      totals.late += events.length - ok.length;
      return { accepted: ok.length, late: events.length - ok.length };
    },
    cancel(fromMs) {
      const now = clock.now(), from = Math.max(now, fromMs ?? -Infinity);
      port.cancels.push({ now, fromMs });
      port.events = port.events.filter(e => e.at < from);
    },
    playNow: () => clock.now(),
    setLevels() { /* not time-critical */ },
    backing,
    onRouteChange(fn) { routeFns.add(fn); return () => { routeFns.delete(fn); }; },
    onInterruption(fn) { interruptFns.add(fn); return () => { interruptFns.delete(fn); }; },
    emitInterruption(e) { interruptFns.forEach(f => f(e)); },
    stats: () => ({ ...totals }),
  };
  return port;
}
