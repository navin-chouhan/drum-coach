// A fake AudioPort and Clock for tests (core, and the apps' own take tests): it records what was handed over, drops
// events that are already too late (heard before now + minLeadMs) as native does, and keeps them per heard time.
import type { Clock } from '../platform.ts';
import type { AudioEvent, AudioInterruption, AudioPort, AudioRoute, BackingPort } from './audioPort.ts';

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

export type BackingStart = { now: number; at: number; offsetMs: number; rate: number };

export type FakeBackingPort = BackingPort & {
  loads: string[];
  starts: BackingStart[];
  /** Clock times of every stop(). */
  stops: number[];
  /** Makes load() reject with this message. */
  fail?: string;
  /** The device's rate error: the file plays (1 + ppm × 1e-6) × faster than the Clock says (AUDIO-DESIGN §6). */
  ppm: number;
  /** The file position heard at Clock time t (null when nothing is heard then): the true song line. */
  heardAt(t: number): number | null;
};

/**
 * A fake backing player, as native's BackingPlayer behaves: a start replaces what's playing at once and is heard from
 * `at` (a negative offset waits −offset / rate first), the file then plays at rate × (1 + ppm) until its end or a
 * stop. `anchor()` reads the heard position at the Clock's now (null before the start is heard or after the end).
 */
type Line = { at: number; offsetMs: number; rate: number; from: number; until: number };

export function createFakeBackingPort(clock: Clock, o: { durationMs?: number; ppm?: number } = {}): FakeBackingPort {
  const durationMs = o.durationMs ?? 600_000;
  const past: Line[] = []; // every start's line, `until` the next start or stop replaced it
  let line: Line | null = null;
  const b: FakeBackingPort = {
    loads: [], starts: [], stops: [], ppm: o.ppm ?? 0,
    load(uri) {
      b.loads.push(uri);
      return b.fail ? Promise.reject(new Error(b.fail)) : Promise.resolve({ durationMs, sampleRate: 44100 });
    },
    start({ at, offsetMs, rate }) {
      const now = clock.now();
      b.starts.push({ now, at, offsetMs, rate });
      if (line) line.until = Math.min(line.until, now);
      const lead = Math.max(0, -offsetMs) / rate;
      line = { at: at + lead, offsetMs: Math.max(0, offsetMs), rate, from: now, until: Infinity };
      past.push(line);
    },
    stop() {
      const now = clock.now();
      b.stops.push(now);
      if (line) line.until = Math.min(line.until, now);
      line = null;
    },
    heardAt(t) {
      for (let i = past.length - 1; i >= 0; i--) {
        const l = past[i];
        if (t < l.from || t >= l.until) continue;
        if (t < l.at) return null;
        const fileMs = l.offsetMs + (t - l.at) * l.rate * (1 + b.ppm * 1e-6);
        return fileMs < durationMs ? fileMs : null;
      }
      return null;
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
