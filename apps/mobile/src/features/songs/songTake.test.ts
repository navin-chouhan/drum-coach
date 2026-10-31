import type { Hit } from '@drum-coach/core/input/hits';
import { describe, expect, it } from 'vitest';
import { RunInputSchema } from '../../data/runs';
import type { PlayResult } from '../../play/events';
import { songTakeOptions, type SongPlayer } from './modes';
import { createFakeAudioPort } from '@drum-coach/core/play/fakeAudio';
import { createSongTake, songRun, type SongTakeResult } from './songTake';

// A synthetic song: 120 BPM, beat 0 at 1 s in the video; the video plays from the moment begin() seeks.
function rig() {
  let now = 0, videoAt = 0, startedAt = 0, playing = false;
  const yt: SongPlayer = {
    get playing() { return playing; }, duration: 300,
    songTime: (t = now) => (playing ? videoAt + (t - startedAt) / 1000 : videoAt),
    seek: s => { videoAt = s; startedAt = now; }, play: () => { playing = true; startedAt = now; }, pause: () => { videoAt = yt.songTime(now); playing = false; },
  };
  const hitFns = new Set<(h: Hit) => void>(), polls = new Set<() => void>();
  const clock = { now: () => now };
  let latencyMs = 0;
  const deps = {
    clock, audio: createFakeAudioPort(clock),
    settings: () => ({ latencyMs, countIn: false, liveTips: 'off' as const, chattiness: 'normal' as const }),
    setLatency: (ms: number) => { latencyMs = ms; },
    onHit: (fn: (h: Hit) => void) => { hitFns.add(fn); return () => hitFns.delete(fn); },
    every: (_ms: number, fn: () => void) => { polls.add(fn); return () => polls.delete(fn); },
    wallClock: () => Date.parse('2026-10-30T20:00:00Z'),
  };
  const advance = (to: number) => { for (; now < to; now += 10) polls.forEach(p => p()); now = to; polls.forEach(p => p()); };
  const hit = (pad: Hit['pad'], at: number) => { advance(at); hitFns.forEach(f => f({ note: 0, velocity: 90, time: at, pad })); };
  return { yt, deps, advance, hit, polls };
}

describe('song take (the song is the clock)', () => {
  const g = { bpm: 120, offsetSec: 1 };
  const song = { id: 'yt-dQw4w9WgXcQ', title: 'Song', originalId: 'dQw4w9WgXcQ', drumlessId: null, coverId: null, timeSignature: [4, 4] as [4, 4],
    notes: [{ t: 4, drum: 'kick' as const }, { t: 5, drum: 'snare' as const }, { t: 6, drum: 'kick' as const }, { t: 7, drum: 'snare' as const }], grids: {} };

  it('judges strokes on the song grid, misses the rest, finishes after the section', async () => {
    const r = rig();
    const { chart, opts } = songTakeOptions({ s: song, g, yt: r.yt, range: { from: 2, to: 2 }, rate: 1 });
    const take = createSongTake(r.deps, chart, opts);
    const seen: PlayResult[] = [];
    take.results(e => seen.push(e));
    let done: SongTakeResult | null = null;
    take.onFinish(f => { done = f; });
    await take.start(); // seeks to bar 1 (1 s), so bar 2 beat 0 = song 3 s = 2 s from now
    expect(take.position(0)).toBeCloseTo(-4, 6);
    r.hit('kick', 2000 + 10); // +10 ms
    r.hit('snare', 2500 - 30); // −30 ms
    r.hit('crash', 2700); // an extra
    // the kick on beat 2 (3000) is never played; the snare on beat 3 is
    r.hit('snare', 3500);
    r.advance(5000);
    expect(done).not.toBeNull();
    const d = done!;
    expect(d.results.map(x => x.judgement)).toEqual(['perfect', 'perfect', 'miss', 'perfect']);
    expect(d.stats.extra).toBe(1);
    expect(seen.filter(e => e.kind === 'judged' && e.judgement === 'miss')).toHaveLength(1);
    expect(take.running).toBe(false);
    expect(r.yt.playing).toBe(false);
    const run = songRun(d, song.title, song.id);
    expect(RunInputSchema.safeParse(run).success).toBe(true);
    expect(run.summary.section).toEqual({ fromBar: 2, toBar: 2 });
  });

  it('latency comes off every stroke; stop drops the take', async () => {
    const r = rig();
    r.deps.setLatency(50);
    const { chart, opts } = songTakeOptions({ s: song, g, yt: r.yt, range: { from: 2, to: 2 }, rate: 1 });
    const take = createSongTake(r.deps, chart, opts);
    const seen: PlayResult[] = [];
    take.results(e => seen.push(e));
    let finished = false;
    take.onFinish(() => { finished = true; });
    await take.start();
    r.hit('kick', 2050);
    expect(seen[0]).toMatchObject({ kind: 'judged', judgement: 'perfect', offsetMs: 0 });
    take.stop();
    r.advance(6000);
    expect(finished).toBe(false);
    expect(r.polls.size).toBe(0);
  });

  it('an interruption (D6) keeps ≥ 2 whole bars, flagged; fewer are dropped', async () => {
    const r = rig();
    const long = { ...song, notes: Array.from({ length: 12 }, (_, i) => ({ t: 4 + i, drum: i % 2 ? 'snare' as const : 'kick' as const })) }; // bars 2–4
    const { chart, opts } = songTakeOptions({ s: long, g, yt: r.yt, range: { from: 2, to: 4 }, rate: 1 });
    const take = createSongTake(r.deps, chart, opts);
    let done: SongTakeResult | null = null;
    take.onFinish(f => { done = f; });
    await take.start(); // bar 2 beat 0 at 2000 ms, 2 s a bar
    r.hit('kick', 2000); r.hit('snare', 2500);
    r.advance(2000 + 4500);
    take.interrupt();
    expect(take.running).toBe(false);
    const d = done!;
    expect(d.interrupted).toBe(true);
    expect(d.run.beats).toBe(8);
    const run = songRun(d, song.title, song.id);
    expect(run.summary.interrupted).toBe(true);
    expect(RunInputSchema.safeParse(run).success).toBe(true);
    expect(songRun({ ...d, interrupted: undefined }, song.title, song.id).summary).not.toHaveProperty('interrupted');

    const r2 = rig();
    const t2 = createSongTake(r2.deps, chart, opts);
    let kept = false;
    t2.onFinish(() => { kept = true; });
    await t2.start();
    r2.advance(2000 + 1500);
    t2.interrupt(r2.deps.clock.now());
    expect(kept).toBe(false);
    expect(t2.running).toBe(false);
  });
});
