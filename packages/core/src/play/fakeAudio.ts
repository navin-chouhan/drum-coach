// A fake AudioPort and Clock for tests (core, and the apps' own take tests): it records what was handed over, drops
// events that are already too late (heard before now + minLeadMs) as native does, and keeps them per heard time.
import type { Clock } from '../platform.ts';
import type { AudioEvent, AudioInterruption, AudioPort, AudioRoute } from './audioPort.ts';

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

export function createFakeAudioPort(clock: Clock, route: AudioRoute | null = SPEAKER): FakeAudioPort {
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
    backing: null,
    onRouteChange(fn) { routeFns.add(fn); return () => { routeFns.delete(fn); }; },
    onInterruption(fn) { interruptFns.add(fn); return () => { interruptFns.delete(fn); }; },
    emitInterruption(e) { interruptFns.forEach(f => f(e)); },
    stats: () => ({ ...totals }),
  };
  return port;
}
