// createTake on synthetic hit streams (AUDIO-DESIGN §7.1 T6-2, T6-4, T6-5; §4): count-in, chunked hand-over, stalls,
// wait mode, endless and interrupted takes, stale hits, and a missing or failing audio port.
import { describe, expect, it, vi } from 'vitest';
import type { AudioEvent, AudioRoute } from './audioPort.ts';
import { createFakeAudioPort, createFakeClock, SPEAKER, type FakeAudioPort, type FakeClock } from './fakeAudio.ts';
import { AHEAD_MS, CHUNK_MS } from './feeder.ts';
import { planEvents, planSpecFor } from './plan.ts';
import { createTake, MIN_INTERRUPTED_BARS, type Finished, type Take, type TakeDeps, type TakeEnd, type TakeOptions, type TakeSettings } from './take.ts';
import type { Chart, ChartNote } from '../engine/chart.ts';
import type { Hit } from '../input/hits.ts';

const SETTINGS: TakeSettings = { latencyMs: 0, countIn: true, liveTips: 'off', chattiness: 'normal' };
const BASE: TakeOptions = { fromBar: 1, toBar: 1, repeats: 4, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false };

/** One bar of 4/4 at 120 BPM (500 ms beats): snare on every beat. */
const quarters = (o: Partial<Chart> = {}): Chart => ({ title: 'q', bpm: 120, timeSignature: [4, 4], bars: 1, notes: [0, 1, 2, 3].map(t => ({ t, drum: 'snare' as const })), ...o });

type Rig = {
  clock: FakeClock; audio: FakeAudioPort; finished: Finished[]; ends: TakeEnd[];
  emit: (time: number, pad?: Hit['pad'], velocity?: number) => void;
  onHit: TakeDeps['onHit'];
};

function rig(t0 = 1000, route: AudioRoute | null = SPEAKER): Rig {
  const clock = createFakeClock(t0), audio = createFakeAudioPort(clock, route);
  const fns = new Set<(h: Hit) => void>();
  return {
    clock, audio, finished: [], ends: [],
    emit: (time, pad = 'snare', velocity = 80) => fns.forEach(f => f({ note: 38, velocity, time, pad })),
    onHit: fn => { fns.add(fn); return () => { fns.delete(fn); }; },
  };
}

function makeTake(r: Rig, chart: Chart, o: Partial<TakeOptions> = {}, settings: Partial<TakeSettings> = {}, extra: Pick<TakeDeps, 'wording'> = {}) {
  const take = createTake({ clock: r.clock, audio: r.audio, onHit: r.onHit, settings: () => ({ ...SETTINGS, ...settings }), wallClock: () => r.clock.now(), ...extra }, chart, { ...BASE, ...o });
  take.onFinish(f => r.finished.push(f));
  take.onEnd(e => r.ends.push(e));
  return take;
}

/** Ticks every `step` ms up to (not past) `until`, emitting the strokes due before each tick. */
function playUntil<O extends TakeOptions>(r: Rig, take: Take<O>, until: number, strokes: number[] = [], step = 100) {
  const queue = [...strokes].sort((a, b) => a - b);
  for (let now = r.clock.now() + step; now <= until && take.state.phase === 'playing'; now += step) {
    while (queue.length && queue[0] <= now) { const t = queue.shift()!; r.clock.set(t); r.emit(t); }
    r.clock.set(now);
    take.tick(now);
  }
}

const sounds = (events: AudioEvent[], name: string) => events.filter(e => e.kind === 'sound' && e.sound === name);

describe('start: the count-in and the first chunk', () => {
  it('picks zero = now + lead + count-in and hands over 4 s, with the words on the beats', async () => {
    const r = rig();
    const take = makeTake(r, quarters());
    expect(take.state.phase).toBe('idle');
    const started = take.start();
    expect(take.state.phase).toBe('starting');
    expect(take.start()).toBe(started); // one take, one start
    await started;
    expect(take.state.phase).toBe('playing');
    expect(take.state.route).toEqual(SPEAKER);
    const lead = Math.max(300, SPEAKER.minLeadMs + 100);
    expect(take.state.zero).toBe(1000 + lead + 4 * 500);
    expect(take.position(take.state.zero - 1000)).toBe(-2); // in the count-in
    const z = take.state.zero;
    expect(sounds(r.audio.events, 'word.one').map(e => e.at)).toEqual([z - 2000]);
    expect(sounds(r.audio.events, 'word.four').map(e => e.at)).toEqual([z - 500]);
    expect(sounds(r.audio.events, 'click.bar').map(e => e.at)).toEqual([z - 2000, z]);
    // 4 s ahead of now: everything heard before 1000 + 4000
    expect(Math.max(...r.audio.events.map(e => e.at))).toBeLessThan(1000 + CHUNK_MS);
    expect(r.audio.calls).toHaveLength(1);
    expect(take.state.feed!.chunks).toBe(1);
  });

  it('a slower route gets a longer lead', async () => {
    const r = rig(0, { ...SPEAKER, key: 'BT', kind: 'bluetooth', minLeadMs: 260 });
    const take = makeTake(r, quarters(), { countInBars: 0 });
    await take.start();
    expect(take.state.zero).toBe(360);
  });

  it('leaves out words the port could not prepare', async () => {
    const r = rig();
    r.audio.missing = new Set(['three']);
    const take = makeTake(r, quarters());
    await take.start();
    expect(take.state.missingWords).toEqual(['three']);
    expect(sounds(r.audio.events, 'word.three')).toEqual([]);
    expect(sounds(r.audio.events, 'word.two')).toHaveLength(1);
  });

  it('no voice: the count-in only clicks, and no words are prepared', async () => {
    const r = rig(), prepare = vi.spyOn(r.audio, 'prepareWords');
    const take = makeTake(r, quarters(), {}, { countIn: false });
    await take.start();
    expect(prepare).not.toHaveBeenCalled();
    expect(r.audio.events.some(e => e.kind === 'sound' && e.sound.startsWith('word.'))).toBe(false);
  });

  it('a port that fails to prepare words: they are all missing', async () => {
    const r = rig();
    r.audio.prepareWords = () => Promise.reject(new Error('tts down'));
    const take = makeTake(r, quarters());
    await take.start();
    expect(take.state.missingWords).toEqual(['one', 'two', 'three', 'four']);
    expect(r.audio.events.filter(e => e.kind === 'sound' && e.sound.startsWith('word.'))).toEqual([]);
  });

  it('without audio (no module, Expo Go) the take still runs and scores, silently', async () => {
    const r = rig(1000, null);
    const take = makeTake(r, quarters(), { repeats: 1 });
    await take.start();
    expect(take.state.audioError).toBe('no audio');
    expect(take.state.route).toBeNull();
    expect(take.state.zero).toBe(1000 + 300 + 2000);
    const z = take.state.zero;
    playUntil(r, take, z + 3000, [z, z + 500, z + 1000, z + 1500]);
    expect(r.finished[0].stats.accuracy).toBe(100);
  });

  it('a non-Error rejection is still reported', async () => {
    const r = rig();
    r.audio.start = () => Promise.reject('engine busy'); // not an Error
    const take = makeTake(r, quarters());
    await take.start();
    expect(take.state.audioError).toBe('engine busy');
  });

  it('stopped while starting: it never begins', async () => {
    const r = rig();
    const take = makeTake(r, quarters());
    const p = take.start();
    take.stop();
    await p;
    expect(take.state.phase).toBe('idle');
    expect(r.audio.calls).toEqual([]);
    expect(r.ends).toEqual([{ reason: 'user', finished: null }]);
    take.tick(99_999); // nothing to do
    take.stop(); // nor here
    expect(r.ends).toHaveLength(1);
  });
});

describe('tick: the hand-over (T6-4)', () => {
  it('keeps ≥ 2 s handed over, each event once, nothing past the end, at random tick intervals', async () => {
    const r = rig(5e8);
    const chart = quarters({ notes: [...quarters().notes, { t: 0.5, drum: 'kick', auto: true }] });
    const take = makeTake(r, chart, { repeats: 40, subdivision: 2, band: { style: 'rock' } });
    await take.start();
    const z = take.state.zero, endAt = z + 40 * 2000;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let now = r.clock.now(); take.state.phase === 'playing';) {
      now += 5 + rand() * 395;
      r.clock.set(now);
      take.tick(now);
      const horizon = z + take.state.feed!.plannedTo * take.state.beatMs;
      if (take.state.phase === 'playing' && horizon < endAt - 1e-6) expect(horizon).toBeGreaterThanOrEqual(now + AHEAD_MS);
    }
    expect(take.state.phase).toBe('done');
    const all = r.audio.calls.flatMap(c => c.events);
    const keys = all.map(e => `${e.at}|${e.kind === 'sound' ? e.sound : e.part}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Math.max(...all.map(e => e.at))).toBeLessThan(endAt);
    // the chunks add up to the one big plan
    const { run, auto } = { run: take.state.run, auto: take.state.run.notes.filter((_, i) => take.state.auto[i]) };
    const spec = planSpecFor(take.state.chart, run, auto, take.state.options, { zero: z, beatMs: 500, countVoice: true, missingWords: new Set() });
    expect(all).toEqual(planEvents(spec, -4, run.beats));
    expect(take.state.feed!.late).toBe(0);
    expect(r.audio.stats().late).toBe(0);
    expect(all.length).toBe(take.state.feed!.events);
  });

  it('after a stall longer than 2 s, the late part of the chunk is dropped and counted, never played late', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { repeats: 8 });
    await take.start();
    const before = take.state.feed!.events;
    r.clock.advance(6000); // JS stalled for 6 s
    take.tick(r.clock.now());
    const feed = take.state.feed!;
    expect(feed.late).toBeGreaterThan(0);
    expect(feed.events - before).toBe(feed.accepted - before + feed.late - 0);
    const last = r.audio.calls.at(-1)!;
    expect(last.events.every(e => e.at >= last.now + SPEAKER.minLeadMs)).toBe(true);
    expect(r.audio.stats().late).toBe(0); // the port never saw them
  });

  it('counts what the port itself reports late', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { repeats: 8 });
    await take.start();
    r.audio.schedule = events => ({ accepted: events.length - 1, late: 1 });
    r.clock.advance(2500);
    take.tick(r.clock.now());
    expect(take.state.feed!.late).toBe(1);
  });
});

describe('scoring on the Clock (T6-2)', () => {
  /** 5 minutes at 120 BPM: snare on every beat, 150 bars. Strokes = heard clicks + 20 ms (+ seeded noise). */
  async function fiveMinutes(t0: number, sigma: number) {
    const r = rig(t0);
    const take = makeTake(r, quarters(), { repeats: 150, countInBars: 1 });
    await take.start();
    const z = take.state.zero;
    let seed = 42;
    const gauss = () => { let s = 0; for (let i = 0; i < 12; i++) s += (seed = (seed * 16807) % 2147483647) / 2147483647; return s - 6; };
    const clicks = sounds(r.audio.events, 'click.bar').length; // (only the first chunk so far)
    expect(clicks).toBeGreaterThan(0);
    const strokes = Array.from({ length: 600 }, (_, k) => z + k * 500 + 20 + sigma * gauss());
    playUntil(r, take, z + 301_000, strokes);
    const f = r.finished[0];
    // the heard clicks really were at zero + k × beatMs
    const beats = r.audio.events.filter(e => e.kind === 'sound' && e.at >= z && e.sound.startsWith('click.')).map(e => e.at - z);
    expect(beats).toHaveLength(600);
    beats.forEach((b, k) => expect(Math.abs(b - k * 500)).toBeLessThan(1e-6));
    return { f, z };
  }

  it('noise-free: every offset is 20 ms, minute by minute, at +0 and at +1e9', async () => {
    for (const t0 of [0, 1e9]) {
      const { f } = await fiveMinutes(t0, 0);
      for (let m = 0; m < 5; m++) {
        const offs = f.results.slice(m * 120, (m + 1) * 120).map(r => r.offset!);
        expect(Math.abs(offs.reduce((a, x) => a + x, 0) / offs.length - 20)).toBeLessThan(0.001);
      }
      expect(f.stats.meanOffset).toBe(20);
      expect(f.stats.spread).toBe(0);
    }
  });

  it('noisy: the same score at +0 and at +1e9', async () => {
    const a = await fiveMinutes(0, 8), b = await fiveMinutes(1e9, 8);
    expect(b.f.stats).toEqual(a.f.stats);
    expect(b.f.results.map(r => r.judgement)).toEqual(a.f.results.map(r => r.judgement));
    b.f.results.forEach((r, k) => expect(Math.abs(r.offset! - a.f.results[k].offset!)).toBeLessThan(1e-6));
    expect(a.f.stats.accuracy).toBe(100);
    expect(Math.abs(a.f.stats.meanOffset - 20)).toBeLessThan(1);
  });

  it('subtracts the latency, and ignores strokes older than the take (B25)', async () => {
    const r = rig(10_000);
    const take = makeTake(r, quarters(), { repeats: 1 }, { latencyMs: 30 });
    await take.start();
    const z = take.state.zero;
    r.emit(9_999); // a stroke queued before the take was created
    playUntil(r, take, z + 3000, [z + 30, z + 530, z + 1030, z + 1530]);
    const f = r.finished[0];
    expect(f.hits).toHaveLength(4);
    expect(f.results.map(x => x.offset)).toEqual([0, 0, 0, 0]);
    expect(f.extras).toEqual([]);
  });
});

describe('wait mode', () => {
  it('advances to each group, waits there until it is played, then finishes', async () => {
    const r = rig();
    const chart = quarters({ notes: [{ t: 0, drum: 'kick' }, { t: 0, drum: 'hihat' }, { t: 1, drum: 'snare' }] as ChartNote[] });
    const take = makeTake(r, chart, { wait: true, repeats: 1 });
    const prepare = vi.spyOn(r.audio, 'prepareWords');
    expect(take.position(0)).toBe(-0.5); // not started
    await take.start();
    expect(prepare).not.toHaveBeenCalled();
    expect(r.audio.calls).toEqual([]); // no clicks in wait mode
    expect(take.state.zero).toBe(1000 + 300); // (the audio isn't started: wait mode plays nothing)
    expect(take.position(1000 + 10_000)).toBe(0); // waits at the first group
    take.tick(20_000); // tick does nothing in wait mode
    r.emit(11_000, 'kick');
    expect(take.state.waitGroup).toBe(0); // half the group
    r.emit(11_100, 'tom1'); // not in the group: an extra
    r.emit(11_200, 'hhClosed');
    expect(take.state.waitGroup).toBe(1);
    expect(take.position(11_200 + 250)).toBeCloseTo(0.9, 9); // from the last position() call, as on the web
    expect(take.position(11_200 + 5000)).toBe(1);
    r.emit(16_300, 'snare');
    expect(take.state.phase).toBe('done');
    const f = r.finished[0];
    expect(f.results.map(x => x.judgement)).toEqual(['good', 'good', 'good']);
    expect(f.extras).toHaveLength(1);
    expect(f.stats.reaction).toBeNull();
    r.emit(17_000, 'snare'); // after the end: nothing
    expect(f.hits).toHaveLength(4);
    expect(take.state.feedback.map(x => x.judgement)).toEqual(['good', 'extra', 'good', 'good']);
  });

  it('is dropped when stopped or interrupted (it can be started again)', async () => {
    for (const reason of ['user', 'interrupted'] as const) {
      const r = rig();
      const take = makeTake(r, quarters(), { wait: true });
      await take.start();
      r.emit(2000);
      take.stop(reason);
      expect(take.state.phase).toBe('idle');
      expect(r.ends).toEqual([{ reason, finished: null }]);
      expect(r.audio.cancels).toEqual([]);
    }
  });
});

describe('the end of a take', () => {
  const allBeats = (z: number, beats: number) => Array.from({ length: beats }, (_, k) => z + k * 500 + 5);

  it('a timed take ends 400 ms after its last beat', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { repeats: 2 });
    const changes: string[] = [];
    take.onChange(() => changes.push(take.state.phase));
    await take.start();
    const z = take.state.zero;
    playUntil(r, take, z + 4000 + 300, allBeats(z, 8), 50);
    expect(take.state.phase).toBe('playing');
    playUntil(r, take, z + 4000 + 500, [], 50);
    expect(take.state.phase).toBe('done');
    expect(changes).toEqual(['starting', 'playing', 'done']);
    expect(r.ends).toEqual([{ reason: 'end', finished: r.finished[0] }]);
    expect(take.state.finished).toBe(r.finished[0]);
    expect(r.finished[0].interrupted).toBeUndefined();
    expect(r.finished[0].durationS).toBe(Math.round((z + 4450 - 1000) / 1000));
    take.stop(); // after the end: nothing
    expect(take.state.phase).toBe('done');
    expect(r.audio.cancels).toEqual([]);
  });

  it('stop() drops a timed take and cancels what it planned', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { repeats: 8 });
    await take.start();
    const z = take.state.zero;
    playUntil(r, take, z + 3000, allBeats(z, 6));
    const pending = r.audio.events.filter(e => e.at >= z + 3000).length;
    expect(pending).toBeGreaterThan(0);
    take.stop();
    expect(r.audio.cancels).toHaveLength(1);
    expect(r.audio.events.filter(e => e.at >= z + 3000)).toEqual([]);
    expect(take.state.phase).toBe('idle');
    expect(r.finished).toEqual([]);
    expect(r.ends).toEqual([{ reason: 'user', finished: null }]);
    const calls = r.audio.calls.length;
    take.tick(z + 5000);
    expect(r.audio.calls).toHaveLength(calls); // nothing more is planned
  });

  it('an endless take keeps the whole bars played when stopped (the last bar and the stop strokes are not part of it)', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { endless: true });
    await take.start();
    const z = take.state.zero;
    expect(take.state.run.beats).toBe(64 * 4);
    playUntil(r, take, z + 4 * 2000 + 1200, allBeats(z, 18)); // into bar 5
    take.stop('user');
    expect(r.audio.cancels).toHaveLength(1);
    const f = r.finished[0];
    expect(f.run.beats).toBe(16);
    expect(f.results).toHaveLength(16);
    expect(f.hits).toHaveLength(16); // strokes after the last whole bar are dropped
    expect(f.hits.every(h => h.time < z + 8000)).toBe(true);
    expect(f.interrupted).toBeUndefined();
    expect(r.ends[0].reason).toBe('user');
  });

  it('an endless take with seconds ends by itself, and never plans past its seconds', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { endless: true, seconds: 10 });
    await take.start();
    const z = take.state.zero;
    playUntil(r, take, z + 11_000, allBeats(z, 20));
    expect(take.state.phase).toBe('done');
    expect(r.finished[0].run.beats).toBe(20);
    expect(Math.max(...r.audio.calls.flatMap(c => c.events).map(e => e.at))).toBeLessThan(z + 10_000);
    expect(r.ends[0].reason).toBe('end');
  });

  it('interrupted in bar 3: bars 1–2 are kept and flagged', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { repeats: 8 });
    await take.start();
    const z = take.state.zero;
    playUntil(r, take, z + 4000 + 700, allBeats(z, 10));
    take.stop('interrupted');
    expect(r.audio.cancels).toHaveLength(1);
    const f = r.finished[0];
    expect(MIN_INTERRUPTED_BARS).toBe(2);
    expect(f.interrupted).toBe(true);
    expect(f.run.beats).toBe(8);
    expect(f.results).toHaveLength(8);
    expect(f.stats.accuracy).toBe(100);
    expect(r.ends).toEqual([{ reason: 'interrupted', finished: f }]);
  });

  it('interrupted mid-bar 7 (at the interruption time): bars 1–6 are kept (T6-5)', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { repeats: 8 });
    await take.start();
    const z = take.state.zero;
    playUntil(r, take, z + 6 * 2000 + 1500, allBeats(z, 27));
    take.stop('interrupted', z + 6 * 2000 + 900); // the interruption began a little before we heard of it
    expect(r.finished[0].run.beats).toBe(24);
    expect(r.finished[0].hits.every(h => h.time < z + 12_000)).toBe(true);
  });

  it('interrupted in bar 2 (or bar 1): discarded', async () => {
    for (const into of [500, 2600]) {
      const r = rig();
      const take = makeTake(r, quarters(), { repeats: 8 });
      await take.start();
      const z = take.state.zero;
      playUntil(r, take, z + into, allBeats(z, 6));
      take.stop('interrupted');
      expect(r.finished).toEqual([]);
      expect(take.state.phase).toBe('idle');
      expect(r.ends).toEqual([{ reason: 'interrupted', finished: null }]);
    }
  });

  it('interrupted with no notes in its whole bars: discarded', async () => {
    const r = rig();
    const chart = quarters({ bars: 4, notes: [{ t: 12, drum: 'snare' }] });
    const take = makeTake(r, chart, { toBar: 4, repeats: 1 });
    await take.start();
    const z = take.state.zero;
    playUntil(r, take, z + 6100);
    take.stop('interrupted');
    expect(r.finished).toEqual([]);
  });

  it('an interrupted endless take is flagged too', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { endless: true });
    await take.start();
    const z = take.state.zero;
    playUntil(r, take, z + 7000, allBeats(z, 14));
    take.stop('interrupted');
    expect(r.finished[0].interrupted).toBe(true);
    expect(r.finished[0].run.beats).toBe(12);
  });

  it('a demo plays the notes and ends without a result', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { demo: true, repeats: 1 });
    await take.start();
    expect(sounds(r.audio.events, 'drum.snare')).toHaveLength(4);
    expect(sounds(r.audio.events, 'word.one')).toEqual([]); // no spoken count-in under a demo
    const z = take.state.zero;
    r.emit(z); // not scored
    playUntil(r, take, z + 3000);
    expect(take.state.phase).toBe('idle');
    expect(r.finished).toEqual([]);
    expect(r.ends).toEqual([{ reason: 'end', finished: null }]);
  });

  it('a demo stopped or interrupted is dropped', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { demo: true, repeats: 8 });
    await take.start();
    playUntil(r, take, take.state.zero + 5000);
    take.stop('interrupted');
    expect(r.ends).toEqual([{ reason: 'interrupted', finished: null }]);
  });
});

describe('live tips', () => {
  it('uses the coach\'s wording and tells the listeners', async () => {
    const r = rig();
    const wording = vi.fn((_chart: Chart, cue: { id: string; text: string; spoken: string; priority: number }) => ({ ...cue, text: `coach: ${cue.text}` }));
    const take = makeTake(r, quarters(), { repeats: 8 }, { liveTips: 'screen', chattiness: 'talkative' }, { wording });
    const heard: string[] = [];
    const off = take.onCue(c => heard.push(c.text));
    await take.start();
    const z = take.state.zero;
    playUntil(r, take, z + 16_500, Array.from({ length: 32 }, (_, k) => z + k * 500 - 60)); // rushing
    expect(heard.length).toBeGreaterThan(0);
    expect(heard.every(t => t.startsWith('coach: '))).toBe(true);
    expect(wording.mock.calls[0][0].title).toBe('q');
    expect(take.state.cue!.cue.text).toBe(heard.at(-1));
    expect(r.finished[0].cues.map(c => c.text)).toEqual(heard);
    off();
  });

  it('none in a guided take', async () => {
    const r = rig();
    const take = makeTake(r, quarters(), { repeats: 8, guide: true }, { liveTips: 'voice' });
    await take.start();
    const z = take.state.zero;
    playUntil(r, take, z + 16_500, Array.from({ length: 32 }, (_, k) => z + k * 500 - 60));
    expect(r.finished[0].cues).toEqual([]);
  });
});

describe('on an external clock', () => {
  it('stop() drops it and ends the song clock', async () => {
    const r = rig();
    const ext = { position: (now: number) => (now - 2000) / 500, begin: vi.fn(), end: vi.fn() };
    const take = makeTake(r, quarters(), { external: ext, endless: true, wait: true });
    await take.start();
    expect(ext.begin).toHaveBeenCalledOnce();
    expect(take.state.zero).toBe(0);
    expect(take.state.run.beats).toBe(16); // not sized as an endless flow
    r.emit(2000);
    take.tick(2100);
    take.stop();
    expect(ext.end).toHaveBeenCalledOnce();
    expect(take.state.phase).toBe('idle');
    expect(r.audio.cancels).toEqual([]);
  });

  it('interrupted after 2 bars: kept on the song\'s beats', async () => {
    const r = rig();
    const ext = { position: (now: number) => (now - 2000) / 500, begin: vi.fn(), end: vi.fn() };
    const take = makeTake(r, quarters(), { external: ext });
    await take.start();
    for (let k = 0; k < 10; k++) r.emit(2000 + k * 500);
    take.stop('interrupted', 2000 + 5200);
    expect(r.finished[0].run.beats).toBe(8);
    expect(r.finished[0].results.every(x => x.offset === 0)).toBe(true);
    expect(ext.end).toHaveBeenCalledOnce();
  });
});

describe('feedback lanes', () => {
  it('hi-hat strokes flash the hi-hat lane; a buzz stroke\'s bounces are neither notes nor extras', async () => {
    const r = rig();
    const chart = quarters({ notes: [{ t: 0, drum: 'hhOpen' }, { t: 1, drum: 'snare', buzz: true }, { t: 2, drum: 'hhPedal' }, { t: 3, drum: 'kick' }] });
    const take = makeTake(r, chart, { repeats: 1 });
    await take.start();
    const z = take.state.zero;
    r.emit(z, 'hhOpen');
    r.emit(z + 500, 'snare', 90);
    r.emit(z + 530, 'snare', 50); // a bounce of the buzz
    r.emit(z + 1000, 'hhPedal');
    r.emit(z + 1250, 'hhClosed'); // an extra
    r.emit(z + 1300, 'snare'); // far from its note: an extra
    expect(take.state.feedback.map(f => `${f.lane}:${f.judgement}`)).toEqual(['hihat:perfect', 'snare:perfect', 'hihat:perfect', 'hihat:extra', 'snare:extra']);
    playUntil(r, take, z + 3000);
    expect(r.finished[0].extras).toHaveLength(2);
    expect(r.finished[0].hits).toHaveLength(6);
  });
});

describe('form and options ride along', () => {
  it('extra option fields come back in the result', async () => {
    const r = rig();
    const take = createTake({ clock: r.clock, audio: r.audio, onHit: () => () => undefined, settings: () => SETTINGS }, quarters(), { ...BASE, repeats: 1, lesson: { id: 'l1' } });
    await take.start();
    playUntil(r, take, take.state.zero + 3000);
    expect(take.state.finished!.options.lesson.id).toBe('l1');
    expect(take.state.finished!.startedAt).toMatch(/^\d{4}-/);
  });
});
