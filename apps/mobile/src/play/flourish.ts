// The celebration flourish (web src/lesson/Celebration.tsx flourish): a drum fill through the speakers, a big one for
// a rank up or a song's encore. Pure: the events for AudioPort.schedule, from `at` (Clock ms, already past the lead).
import type { PadId } from '@drum-coach/core/engine/kit';
import type { AudioEvent } from '@drum-coach/core/play/audioPort';

// FILL / BIG_FILL: pad, seconds after the start.
export const FILL: [PadId, number][] = [['snare', 0], ['snare', 0.12], ['tom1', 0.24], ['tom2', 0.36], ['floor', 0.48], ['kick', 0.6], ['crash', 0.6]];
export const BIG_FILL: [PadId, number][] = [...FILL.slice(0, 5), ['snare', 0.6], ['snare', 0.66], ['snare', 0.72], ['snare', 0.78], ['kick', 0.9], ['crash', 0.9], ['kick', 1.2], ['crash', 1.2]];

export const flourishEvents = (at: number, big: boolean): AudioEvent[] =>
  (big ? BIG_FILL : FILL).map(([pad, dt]) => ({ kind: 'sound' as const, at: at + dt * 1000, sound: `drum.${pad}` as const, gain: 110 / 127 }));

/** Plays the flourish on an audio port (nothing without one): 50 ms past the route's lead, as the web's +0.05 s. */
export function playFlourish(audio: { available: boolean; clock: { now(): number }; route(): { minLeadMs: number } | null; schedule(e: AudioEvent[]): void }, big: boolean) {
  if (!audio.available) return;
  audio.schedule(flourishEvents(audio.clock.now() + (audio.route()?.minLeadMs ?? 100) + 50, big));
}
