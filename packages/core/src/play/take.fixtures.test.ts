// T4 parity through the take engine: each recorded fixture (input/fixtures/*.json) is replayed as raw MIDI through
// the core hit bus into createTake, with a fake AudioPort and a fake Clock driven by tick, and must score exactly as
// the web reference (scripts/mobile-playtest/reference/*.json, made by the web's input path and matcher): landed,
// extras, accuracy, mean and spread. Then the same with every time shifted by +1e9 ms (iOS host time).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createFakeAudioPort, createFakeClock } from './fakeAudio.ts';
import { createTake, type Finished } from './take.ts';
import { replayFixture, type MidiFixture } from '../input/fixtures.ts';
import { createHitBus } from '../input/hits.ts';

const FIXTURES = fileURLToPath(new URL('../input/fixtures/', import.meta.url));
const REFERENCES = fileURLToPath(new URL('../../../../scripts/mobile-playtest/reference/', import.meta.url));
type Reference = { landed: number; extras: number; take: { notes: number; latencyMs: number }; summary: { accuracyPct: number; meanOffsetMs: number; spreadMs: number; perfect: number; good: number; missed: number } };

const files = readdirSync(FIXTURES).filter(n => n.endsWith('.json')).sort();

/** Replays a fixture through createTake: the take starts at `t0`, MIDI arrives at zero + t, tick every 100 ms. */
async function playFixture(f: MidiFixture, t0: number) {
  const clock = createFakeClock(t0), audio = createFakeAudioPort(clock);
  const bus = createHitBus({ now: () => clock.now(), getNoteMap: () => f.noteMap, getPadCal: () => ({}) });
  const take = createTake({ clock, audio, onHit: bus.onHit, settings: () => ({ latencyMs: f.latencyMs, countIn: true, liveTips: 'off', chattiness: 'normal' }) }, f.chart,
    { fromBar: f.fromBar, toBar: f.toBar, repeats: f.repeats, speed: f.speed, goodMs: f.goodMs, metronome: true, subdivision: 1, countInBars: 1, wait: false });
  let finished: Finished | undefined;
  take.onFinish(x => { finished = x; });
  await take.start();
  const zero = take.state.zero, midi = [...f.midi].sort((a, b) => a[0] - b[0]);
  let i = 0;
  for (let now = clock.now(); take.state.phase === 'playing' && now < zero + 600_000; now += 100) {
    for (; i < midi.length && zero + midi[i][0] <= now; i++) {
      const [t, ...data] = midi[i];
      clock.set(zero + t);
      bus.receiveMidi(data, zero + t);
    }
    clock.set(now);
    take.tick(now);
  }
  expect(i).toBe(midi.length);
  expect(take.state.phase).toBe('done');
  return { finished: finished!, zero, audio };
}

describe('createTake scores the recorded fixtures as the web does (T4)', () => {
  it('has fixtures and references', () => {
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  for (const file of files) {
    const f = JSON.parse(readFileSync(FIXTURES + file, 'utf8')) as MidiFixture;
    const ref = JSON.parse(readFileSync(REFERENCES + file, 'utf8')) as Reference;

    for (const t0 of [0, 1e9]) {
      it(`${f.name} at +${t0} ms`, async () => {
        const { finished, zero, audio } = await playFixture(f, t0);
        const { results, extras, stats } = finished;
        expect(results.length).toBe(ref.take.notes);
        expect(results.filter(r => r.offset !== undefined).length).toBe(ref.landed);
        expect(extras.length).toBe(ref.extras);
        expect(stats.accuracy).toBe(ref.summary.accuracyPct);
        expect(stats.meanOffset).toBe(ref.summary.meanOffsetMs);
        expect(stats.spread).toBe(ref.summary.spreadMs);
        expect([stats.perfect, stats.good, stats.miss]).toEqual([ref.summary.perfect, ref.summary.good, ref.summary.missed]);
        // note by note, the same as the web's replay (same matcher, same windows)
        const web = replayFixture(f, { zero: 0 });
        results.forEach((r, k) => {
          const w = web.results[k];
          expect(r.judgement).toBe(w.judgement);
          expect(r.pad).toBe(w.pad);
          expect(r.velocity).toBe(w.velocity);
          if (w.offset === undefined) expect(r.offset).toBeUndefined();
          else expect(Math.abs(r.offset! - w.offset)).toBeLessThan(1e-6);
        });
        expect(finished.hits.map(h => h.time - zero).every((t, k) => Math.abs(t - web.hits[k].time) < 1e-6)).toBe(true);
        // the clicks were handed over, and none of them late
        expect(audio.stats().late).toBe(0);
        expect(audio.events.filter(e => e.kind === 'sound' && e.sound === 'click.bar').length).toBe(f.repeats * (f.toBar - f.fromBar + 1) + 1);
      });
    }
  }
});
