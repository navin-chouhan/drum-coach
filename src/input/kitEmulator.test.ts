import { describe, expect, it } from 'vitest';
import type { ChartDrum } from '../engine/chart';
import { DEFAULT_NOTE_MAP } from '../engine/kit';
import { emulateKit, MPS150, playNotes, seededRandom, STEADY_PLAYER, type KitProfile } from '../engine/kitEmulator';
import { scoreRun, type PlayedHit } from '../engine/scoring';
import { onHit, receiveMidi } from './hits';

const CLEAN: KitProfile = { retrigger: {}, crosstalk: 0, usbJitterMs: 0, clockBpm: 120 };
let base = 100_000; // each take later than the last: the bounce filter remembers the previous take's notes

/** Plays notes (beats) at a tempo through the emulated kit and the real input path, then scores the hits. */
function take(drum: ChartDrum, beats: number[], bpm: number, kit: KitProfile, opts: { ghost?: boolean; seed?: number } = {}) {
  const rnd = seededRandom(opts.seed ?? 1), beatMs = 60000 / bpm;
  const expected = beats.map(b => ({ time: base + b * beatMs, drum }));
  const raw = emulateKit(playNotes(expected.map(e => ({ ...e, ghost: opts.ghost })), STEADY_PLAYER, rnd), DEFAULT_NOTE_MAP, kit, rnd);
  base += 1_000_000;
  const hits: PlayedHit[] = [];
  const off = onHit(h => hits.push({ time: h.time, pad: h.pad, velocity: h.velocity }));
  raw.forEach(m => receiveMidi(m.data, m.timeStamp));
  off();
  return { raw, hits, ...scoreRun(expected, hits) };
}
const eighths = Array.from({ length: 16 }, (_, i) => i / 2);

describe('emulated MPS-150 through the real input path', () => {
  it('a steady player accents like a drummer: in an accented pattern the other notes are taps', () => {
    const notes = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ time: i * 250, drum: 'snare' as ChartDrum, accent: i % 4 === 0 }));
    const v = playNotes(notes, STEADY_PLAYER, seededRandom(1)).map(s => s.velocity);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(v.filter((_, i) => i % 4)) / mean(v.filter((_, i) => !(i % 4)))).toBeLessThan(0.7); // passes maxGhostToAccent 0.7
    expect(mean(playNotes(notes.map(n => ({ ...n, accent: false })), STEADY_PLAYER, seededRandom(1)).map(s => s.velocity))).toBeGreaterThan(80); // no accents: full strokes
  });
  it('clock, active sensing and Note Off never become hits', () => {
    const t = take('snare', eighths, 70, CLEAN);
    expect(t.raw.some(m => m.data[0] === 0xf8) && t.raw.some(m => m.data[0] === 0xfe)).toBe(true);
    expect(t.hits).toHaveLength(16);
    expect(t.results.every(r => r.judgement !== 'miss')).toBe(true);
  });

  it('pad retriggers are dropped as bounces: every note played, no extras', () => {
    const t = take('snare', eighths, 70, MPS150);
    const noteOns = t.raw.filter(m => m.data[0] === 0x99 && m.data[2] > 0).length;
    expect(noteOns).toBeGreaterThan(16); // the kit really did retrigger
    expect(t.hits).toHaveLength(16);
    expect(t.extras).toHaveLength(0);
  });

  it('the hi-hat pedal choke (aftertouch) is not a hit; the pedal note is', () => {
    const t = take('hhPedal', [0, 1, 2, 3], 80, CLEAN);
    expect(t.raw.filter(m => m.data[0] === 0xa9)).toHaveLength(12);
    expect(t.hits.map(h => h.pad)).toEqual(['hhPedal', 'hhPedal', 'hhPedal', 'hhPedal']);
  });

  it('soft-snare crosstalk reaches scoring as hi-hat extras (open item F10)', () => {
    const t = take('snare', eighths, 70, { ...CLEAN, crosstalk: 1 }, { ghost: true });
    expect(t.extras.length).toBe(16);
    expect(t.extras.every(h => h.pad === 'hhOpen')).toBe(true);
  });
});
