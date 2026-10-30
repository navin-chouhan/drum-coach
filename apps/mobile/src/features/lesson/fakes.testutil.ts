// Test fakes for the lesson player: a hand-driven Clock, a hit bus, a memory key-value store, and strokes for a take.
import type { PadId } from '@drum-coach/core/engine/kit';
import { DRUM_PAD } from '@drum-coach/core/engine/chart';
import type { Hit } from '@drum-coach/core/input/hits';
import type { AudioEvent } from '@drum-coach/core/play/audioPort';
import { createLocalTake } from './localTake';
import { createSettingsStore } from './settings';
import type { TakeState } from './types';

export function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, set: (v: number) => { t = v; }, advance: (ms: number) => { t += ms; } };
}

export function fakeBus() {
  const fns = new Set<(h: Hit) => void>();
  return {
    onHit: (fn: (h: Hit) => void) => { fns.add(fn); return () => { fns.delete(fn); }; },
    emit: (pad: PadId, time: number, velocity = 96) => fns.forEach(f => f({ note: 38, velocity, time, pad })),
    size: () => fns.size,
  };
}

export function memoryKv() {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); }, remove: (k: string) => { m.delete(k); }, map: m };
}

/** A local take on a fake clock and bus, with every planned sound recorded. */
export function rig(opts: { start?: number; latencyMs?: number; liveTips?: 'off' | 'screen' } = {}) {
  const clock = fakeClock(opts.start), bus = fakeBus(), sounds: AudioEvent[] = [];
  let cancels = 0;
  const take = createLocalTake({
    clock, onHit: bus.onHit, leadMs: 300, wallNow: () => new Date(Date.UTC(2026, 9, 30, 12, 0, 0) + clock.now()),
    settings: () => ({ latencyMs: opts.latencyMs ?? 0, liveTips: opts.liveTips ?? 'off', chattiness: 'normal', countIn: true }),
    sound: { schedule: ev => { sounds.push(...ev); }, cancel: () => { cancels++; } },
  });
  const settings = createSettingsStore(memoryKv(), () => 1);
  return { clock, bus, sounds, take, settings, cancels: () => cancels };
}

/**
 * Plays the running take: every scored note at its time + `offset(i)` ms (undefined = skipped), then runs the clock
 * past the end with ticks.
 */
export function playAll(r: ReturnType<typeof rig>, offset: (i: number) => number | undefined = () => 0, until?: number) {
  const s: TakeState = r.take.state;
  const run = s.run!;
  const strokes = run.notes.flatMap((n, i) => {
    const o = s.auto[i] ? undefined : offset(i);
    return o === undefined ? [] : [{ pad: DRUM_PAD[n.drum][0], at: s.zero + n.t * s.beatMs + o }];
  }).sort((a, b) => a.at - b.at);
  const end = until ?? s.zero + run.beats * s.beatMs + 500;
  for (const st of strokes) {
    if (st.at > end) break;
    while (r.clock.now() + 100 < st.at) { r.clock.advance(100); r.take.tick(); }
    r.clock.set(Math.max(r.clock.now(), st.at));
    r.bus.emit(st.pad, st.at);
  }
  while (r.clock.now() < end && r.take.state.phase === 'playing') { r.clock.advance(100); r.take.tick(); }
}
