import { DRUM_PAD, type ChartDrum } from './chart.ts';
import type { PadId } from './kit.ts';

/**
 * A software stand-in for the Millenium MPS-150 and the person playing it, for testing without the kit.
 * Behaviour comes from docs/KIT.md and the real-kit test (24–25 Oct 2026): Note On on channel 10 with
 * velocity-0 Note Off, constant MIDI Clock and Active Sensing, the hi-hat pedal's aftertouch "choke",
 * pad retriggers 29–56 ms after a stroke at about half its velocity, and soft-snare → hi-hat crosstalk ~10 ms later.
 */

/** Seeded random 0–1 (mulberry32), so a test take is the same every run. */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Stroke = { time: number; pad: PadId; velocity: number };
export type Human = { lateMs: number; jitterMs: number; weakHand: number }; // weakHand: the left hand's velocity, 0–1 of the right's
export type KitProfile = { retrigger: Partial<Record<PadId, number>>; crosstalk: number; usbJitterMs: number; clockBpm: number };
export type RawMidi = { data: number[]; timeStamp: number };

export const STEADY_PLAYER: Human = { lateMs: 20, jitterMs: 15, weakHand: 0.87 };
/** Retrigger and crosstalk rates seen on the owner's kit (snare 8–12 of 24–27 strokes, tom 2 too). */
export const MPS150: KitProfile = { retrigger: { snare: 0.4, tom1: 0.3, tom2: 0.3, floor: 0.3 }, crosstalk: 0.3, usbJitterMs: 1, clockBpm: 120 };

const FEET = new Set<PadId>(['kick', 'hhPedal']);

/** The strokes a player makes for these notes (time in ms): hands alternate R L on hand pads, the weak hand plays softer. */
export function playNotes(notes: { time: number; drum: ChartDrum; accent?: boolean; ghost?: boolean }[], human: Human, rnd = Math.random): Stroke[] {
  let hand = 0, last = -Infinity;
  return [...notes].sort((a, b) => a.time - b.time).map(n => {
    const pad = DRUM_PAD[n.drum][0];
    let velocity = n.accent ? 115 : n.ghost ? 35 : 92;
    if (!FEET.has(pad)) {
      if (n.time - last > 1e-6) hand ^= 1; // notes together (e.g. hi-hat + snare) are two hands, not one alternation step
      if (hand === 0) velocity *= human.weakHand;
      last = n.time;
    }
    const time = n.time + human.lateMs + (rnd() * 2 - 1) * human.jitterMs;
    return { time, pad, velocity: Math.max(1, Math.min(127, Math.round(velocity * (0.95 + rnd() * 0.1)))) };
  });
}

/** What the module sends over USB for these strokes (plus clock and active sensing around them), sorted by time. */
export function emulateKit(strokes: Stroke[], noteMap: Record<PadId, number>, profile: KitProfile, rnd = Math.random): RawMidi[] {
  const out: RawMidi[] = [];
  const usb = (t: number) => t + (rnd() * 2 - 1) * profile.usbJitterMs;
  const on = (t: number, note: number, vel: number) => {
    out.push({ data: [0x99, note, vel], timeStamp: usb(t) });
    out.push({ data: [0x99, note, 0], timeStamp: usb(t + 40) }); // Note Off as velocity 0
  };
  for (const s of strokes) {
    const note = noteMap[s.pad];
    if (s.pad === 'hhPedal') [noteMap.hhOpen, noteMap.hhClosed, note].forEach(n => out.push({ data: [0xa9, n, 127], timeStamp: usb(s.time - 1) })); // the choke
    on(s.time, note, s.velocity);
    const rt = profile.retrigger[s.pad] ?? 0;
    if (rnd() < rt) on(s.time + 29 + rnd() * 27, note, Math.max(1, Math.round(s.velocity * (0.5 + rnd() * 0.15))));
    if (s.pad === 'snare' && s.velocity <= 44 && rnd() < profile.crosstalk) on(s.time + 9 + rnd() * 2, noteMap.hhOpen, Math.max(1, s.velocity - Math.round(rnd() * 8)));
  }
  if (strokes.length) {
    const from = Math.min(...strokes.map(s => s.time)) - 500, to = Math.max(...strokes.map(s => s.time)) + 500;
    for (let t = from, step = 60000 / profile.clockBpm / 24; t < to; t += step) out.push({ data: [0xf8], timeStamp: t });
    for (let t = from; t < to; t += 300) out.push({ data: [0xfe], timeStamp: t });
  }
  return out.sort((a, b) => a.timeStamp - b.timeStamp);
}
