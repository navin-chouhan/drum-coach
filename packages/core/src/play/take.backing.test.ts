// createTake with backing audio (the web's options.backing, AUDIO-DESIGN §1.4 and §6, T6-3): the song starts at the
// take's zero from its sync offset at rate = speed, restarts per repeat, stops at the end, and is the master: its
// drift (read from backing.anchor()) moves hit matching, newly planned clicks and the position.
import { describe, expect, it } from 'vitest';
import type { AudioRoute } from './audioPort.ts';
import { createFakeAudioPort, createFakeBackingPort, createFakeClock, SPEAKER, type FakeBackingPort } from './fakeAudio.ts';
import { createTake, MAX_DRIFT_READING_MS, type TakeOptions, type TakeSettings } from './take.ts';
import type { Chart } from '../engine/chart.ts';
import type { Hit } from '../input/hits.ts';

const SETTINGS: TakeSettings = { latencyMs: 0, countIn: true, liveTips: 'off', chattiness: 'normal' };
const BASE: TakeOptions = { fromBar: 1, toBar: 1, repeats: 1, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false };
const SONG = { uri: 'file:///songs/x.m4a', syncOffsetMs: 200 };

/** `bars` of 4/4 at 120 BPM (500 ms beats): snare on every beat. */
const quarters = (bars = 1): Chart => ({ title: 'q', bpm: 120, timeSignature: [4, 4], bars, notes: Array.from({ length: bars * 4 }, (_, t) => ({ t, drum: 'snare' as const })) });

function rig(o: { t0?: number; ppm?: number; route?: AudioRoute | null; noBacking?: boolean } = {}) {
  const clock = createFakeClock(o.t0 ?? 1000), song = createFakeBackingPort(clock, { ppm: o.ppm });
  const audio = createFakeAudioPort(clock, o.route === undefined ? SPEAKER : o.route, o.noBacking ? null : song);
  const fns = new Set<(h: Hit) => void>();
  const make = (chart: Chart, opts: Partial<TakeOptions> = {}) => createTake({ clock, audio, onHit: fn => { fns.add(fn); return () => { fns.delete(fn); }; }, settings: () => SETTINGS, wallClock: () => clock.now() }, chart, { ...BASE, backing: SONG, ...opts });
  const emit = (time: number) => fns.forEach(f => f({ note: 38, velocity: 80, time, pad: 'snare' }));
  return { clock, audio, song, make, emit };
}

type Rig = ReturnType<typeof rig>;
/** Ticks every `step` ms until `until` (or the take ends), emitting each stroke before the tick after it. */
function drive(r: Rig, take: ReturnType<Rig['make']>, until: number, strokes: number[] = [], step = 100) {
  let next = 0;
  for (let now = r.clock.now() + step; now <= until && take.state.phase === 'playing'; now += step) {
    for (; next < strokes.length && strokes[next] <= now; next++) { r.clock.set(strokes[next]); r.emit(strokes[next]); }
    r.clock.set(now);
    take.tick(now);
  }
}

describe('backing: start, repeats, stop', () => {
  it('loads the file, starts it at zero from its offset at rate = speed, and stops it at the end', async () => {
    const r = rig(), take = r.make(quarters(2), { toBar: 2, speed: 0.8 });
    await take.start();
    const z = take.state.zero, beatMs = take.state.beatMs;
    expect(r.song.loads).toEqual([SONG.uri]);
    expect(beatMs).toBe(625);
    expect(r.song.starts).toEqual([{ now: 1000, at: z, offsetMs: 200, rate: 0.8 }]);
    expect(r.song.heard()).toEqual([{ at: z, offsetMs: 200, rate: 0.8, until: z + 8 * 625 }]); // with the section's length
    expect(r.song.queues).toEqual([]); // one repeat: nothing to queue
    drive(r, take, z + 8 * beatMs - 50);
    expect(r.song.stops).toEqual([]);
    drive(r, take, z + 20_000);
    expect(take.state.phase).toBe('done');
    expect(r.song.stops).toHaveLength(1);
    expect(r.song.stops[0]).toBeGreaterThanOrEqual(z + 8 * beatMs);
    expect(r.song.stops[0]).toBeLessThan(z + 8 * beatMs + 100); // with the section, not with the take's last 400 ms
    expect(take.state.backingError).toBeUndefined();
  });

  it('a section starts where its first bar is in the file; each repeat is queued behind the one before, seamless', async () => {
    const r = rig(), take = r.make(quarters(4), { fromBar: 3, toBar: 4, repeats: 3 });
    await take.start();
    const z = take.state.zero, sec = 8 * 500;
    drive(r, take, z + 3 * sec + 1000);
    expect(r.song.starts.map(s => [s.at - z, s.offsetMs])).toEqual([[0, 4200]]); // bar 3 = 4 s, + 200
    expect(r.song.queues.map(q => [q.at - z, q.offsetMs, q.durationMs])).toEqual([[sec, 4200, sec], [2 * sec, 4200, sec]]);
    // one repeat ahead: repeat 1 with the start, repeat 2 once repeat 1 is heard (within a tick)
    expect(r.song.queues[0].now).toBe(1000);
    expect(r.song.queues[1].now - (z + sec)).toBeGreaterThanOrEqual(0);
    expect(r.song.queues[1].now - (z + sec)).toBeLessThanOrEqual(100);
    // heard back to back: no gap, no overlap at the seams, and the last one ends with the section
    const heard = r.song.heard();
    expect(heard.map(h => [h.at - z, h.offsetMs, h.until - z])).toEqual([[0, 4200, sec], [sec, 4200, 2 * sec], [2 * sec, 4200, 3 * sec]]);
    expect(r.song.heardAt(z + sec - 1)).toBeCloseTo(4200 + sec - 1, 9);
    expect(r.song.heardAt(z + sec)).toBeCloseTo(4200, 9);
    expect(r.song.stops).toHaveLength(1);
  });

  it('an endless take loops the section for as long as it runs; Stop stops the song', async () => {
    const r = rig(), take = r.make(quarters(), { endless: true });
    await take.start();
    const z = take.state.zero;
    drive(r, take, z + 5 * 2000 + 700);
    expect(r.song.starts).toHaveLength(1);
    expect(r.song.queues.map(q => q.at - z)).toEqual([1, 2, 3, 4, 5, 6].map(k => k * 2000)); // repeat 5 heard, 6 queued
    take.stop('user');
    expect(take.state.phase).toBe('done');
    expect(take.state.finished!.run.beats).toBe(20);
    expect(r.song.stops).toEqual([r.clock.now()]);
    expect(r.song.heardAt(r.clock.now() + 500)).toBeNull(); // the queued repeat went with the stop
  });

  it('an interruption and a dropped take stop it too', async () => {
    const r = rig(), take = r.make(quarters(8), { toBar: 8 });
    await take.start();
    drive(r, take, take.state.zero + 7000);
    take.stop('interrupted');
    expect(r.song.stops).toHaveLength(1);
    const r2 = rig(), t2 = r2.make(quarters(8), { toBar: 8 });
    await t2.start();
    t2.stop('user');
    expect(t2.state.phase).toBe('idle');
    expect(r2.song.stops).toHaveLength(1);
  });

  it('stopped while starting: never started', async () => {
    const r = rig(), take = r.make(quarters());
    const started = take.start();
    take.stop('user');
    await started;
    expect(r.song.starts).toEqual([]);
  });
});

describe('backing: when it cannot play, the take goes on without it', () => {
  it('a file that does not load', async () => {
    const r = rig();
    r.song.fail = "backing: can't open x.m4a";
    const take = r.make(quarters());
    await take.start();
    expect(take.state.phase).toBe('playing');
    expect(take.state.backingError).toBe("backing: can't open x.m4a");
    expect(r.song.starts).toEqual([]);
    expect(r.audio.events.length).toBeGreaterThan(0); // the clicks still play
    drive(r, take, take.state.zero + 5000);
    expect(take.state.phase).toBe('done');
    expect(r.song.stops).toEqual([]);
  });

  it('a build without a backing player', async () => {
    const r = rig({ noBacking: true }), take = r.make(quarters());
    await take.start();
    expect(take.state.backingError).toMatch(/no backing player/);
  });

  it('audio that does not start: the file is not even loaded', async () => {
    const r = rig();
    r.audio.fail = 'no module';
    const take = r.make(quarters());
    await take.start();
    expect(take.state.backingError).toBe('no module');
    expect(r.song.loads).toEqual([]);
  });

  it('a load that rejects with a non-Error', async () => {
    const r = rig();
    r.song.load = () => Promise.reject('gone');
    const take = r.make(quarters());
    await take.start();
    expect(take.state.backingError).toBe('gone');
  });

  it('wait mode and an external clock never touch it (as the web)', async () => {
    const r = rig(), take = r.make(quarters(), { wait: true });
    await take.start();
    const ext = r.make(quarters(), { external: { position: () => 0, begin: () => {}, end: () => {} } });
    await ext.start();
    expect(r.song.loads).toEqual([]);
    expect(take.state.driftMs).toBe(0);
  });
});

describe('backing drift (T6-3): the song is the master', () => {
  /** The heard Clock time of file position `fileMs` on the fake song's true line (one start). */
  const trueHeard = (song: FakeBackingPort, fileMs: number) => {
    const s = song.starts[0];
    return s.at + (fileMs - s.offsetMs) / (s.rate * (1 + song.ppm * 1e-6));
  };

  for (const ppm of [100, -100]) {
    it(`${ppm > 0 ? '+' : ''}${ppm} ppm for 5 minutes at 120 BPM on an iOS-like clock: hits on the song score on time, clicks follow it`, async () => {
      const bars = 150, r = rig({ t0: 1e9, ppm }), take = r.make(quarters(bars), { toBar: bars });
      await take.start();
      const z = take.state.zero, offset = SONG.syncOffsetMs;
      // the student plays exactly with the song: beat k is heard when the file is at offset + k × 500 ms
      const strokes = Array.from({ length: bars * 4 }, (_, k) => trueHeard(r.song, offset + k * 500));
      drive(r, take, z + bars * 2000 + 2000, strokes);
      expect(take.state.phase).toBe('done');
      const f = take.state.finished!;
      expect(f.stats.miss).toBe(0);
      const worst = Math.max(...f.results.map(x => Math.abs(x.offset!)));
      expect(worst).toBeLessThan(1);
      // by the end the song has slipped by about ppm × 5 min (30 ms), and the correction has followed it
      const slipped = trueHeard(r.song, offset + bars * 2000) - (z + bars * 2000);
      expect(Math.abs(slipped)).toBeGreaterThan(25);
      expect(Math.abs(take.state.driftMs - slipped)).toBeLessThan(1);
      // clicks planned after minute 1 are heard with the song's beats
      const clicks = r.audio.events.filter(e => e.kind === 'sound' && e.sound.startsWith('click.') && e.at > z + 60_000);
      expect(clicks.length).toBeGreaterThan(400);
      for (const c of clicks) {
        const k = Math.round((c.at - z) / 500);
        expect(Math.abs(c.at - trueHeard(r.song, offset + k * 500))).toBeLessThan(1);
      }
      // and the position follows the song: at the song's last beat it reads that beat
      const at = trueHeard(r.song, offset + bars * 2000);
      expect(Math.abs(take.position(at) - bars * 4)).toBeLessThan(0.002);
    });
  }

  it('+300 ppm across 60 seamless repeats: the drift is read against the repeat the anchor is in', async () => {
    const r = rig({ t0: 1e9, ppm: 300 }), take = r.make(quarters(), { repeats: 60 });
    await take.start();
    const z = take.state.zero, s = r.song.starts[0], k = s.rate * (1 + 300e-6);
    // the player timeline is continuous across seams: beat b (of the whole take) is heard after b × 500 ms of file
    const heardBeat = (b: number) => s.at + (b * 500) / k;
    const strokes = Array.from({ length: 240 }, (_, b) => heardBeat(b));
    drive(r, take, z + 60 * 2000 + 2000, strokes);
    expect(take.state.phase).toBe('done');
    const f = take.state.finished!;
    expect(f.stats.miss).toBe(0);
    expect(Math.max(...f.results.map(x => Math.abs(x.offset!)))).toBeLessThan(1);
    const slipped = heardBeat(240) - (z + 240 * 500); // about −36 ms after 2 minutes
    expect(slipped).toBeLessThan(-30);
    expect(Math.abs(take.state.driftMs - slipped)).toBeLessThan(1);
    expect(r.song.queues).toHaveLength(59);
  });

  it(`a reading of ${MAX_DRIFT_READING_MS} ms or more is a stale anchor, not drift`, async () => {
    const r = rig(), take = r.make(quarters(4), { toBar: 4 });
    await take.start();
    const real = r.song.anchor.bind(r.song);
    r.song.anchor = () => { const a = real(); return a && { at: a.at + MAX_DRIFT_READING_MS, fileMs: a.fileMs }; };
    drive(r, take, take.state.zero + 4000);
    expect(take.state.driftMs).toBe(0);
    r.song.anchor = () => { const a = real(); return a && { at: a.at + 10, fileMs: a.fileMs }; };
    drive(r, take, take.state.zero + 6000);
    expect(take.state.driftMs).toBeGreaterThan(5); // smoothed towards 10
    expect(take.state.driftMs).toBeLessThan(10);
  });
});
