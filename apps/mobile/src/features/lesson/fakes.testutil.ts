// Test fakes for the lesson player: core's fake Clock and AudioPort, a hit bus, a memory key-value store, and strokes
// for a take, driving the real take engine (core createTake) through the lesson's TakePort.
import { DRUM_PAD } from '@drum-coach/core/engine/chart';
import type { PadId } from '@drum-coach/core/engine/kit';
import type { Hit } from '@drum-coach/core/input/hits';
import { createFakeAudioPort, createFakeClock } from '@drum-coach/core/play/fakeAudio';
import { createSettingsStore } from './settings';
import { createTakePort } from './takePort';

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

/** Lets the take's async start (audio.start, prepareWords) finish. */
export const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

/** A take port on a fake clock, fake audio and a fake bus. */
export function rig(opts: { start?: number; latencyMs?: number } = {}) {
  const clock = createFakeClock(opts.start ?? 1000), bus = fakeBus(), audio = createFakeAudioPort(clock);
  const take = createTakePort({
    clock, audio, onHit: bus.onHit, wallClock: () => Date.UTC(2026, 9, 30, 12) + clock.now(),
    settings: () => ({ latencyMs: opts.latencyMs ?? 0, liveTips: 'off', chattiness: 'normal', countIn: true }),
  });
  const settings = createSettingsStore(memoryKv(), () => 1);
  return { clock, bus, audio, take, settings };
}

/**
 * Plays the running take: every scored note at its time + `offset(i)` ms (undefined = skipped), ticking the clock,
 * until `until` (default: past the end).
 */
export async function playAll(r: ReturnType<typeof rig>, offset: (i: number) => number | undefined = () => 0, until?: number) {
  await flush();
  const s = r.take.state, run = s.run!;
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
