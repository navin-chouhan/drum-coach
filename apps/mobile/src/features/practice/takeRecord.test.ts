import { createFakeAudioPort, createFakeClock } from '@drum-coach/core/play/fakeAudio';
import { createTake, type Finished } from '@drum-coach/core/play/take';
import type { Hit } from '@drum-coach/core/input/hits';
import { describe, expect, it } from 'vitest';
import { RunInputSchema } from '../../data/runs';
import type { PlayResult } from '../../play/events';
import { createResultsFeed } from '../lesson/takePort';
import { replayResults, runChart, takenChart } from '../lesson/runChart';
import { practiceCharts } from './catalog';
import { PLAY_DEFAULTS } from './play';
import { runRecord, takeOptions } from './takeRecord';

const singles = practiceCharts().find(c => c.id === 'singles')!; // 2 bars of 16ths on the snare at 70

describe('take options', () => {
  it("are Practice's options with the looped bars", () => {
    expect(takeOptions({ chart: singles, options: { ...PLAY_DEFAULTS, chartId: 'singles', subdivision: 2, wait: true }, section: { from: 2, to: 2 } }))
      .toEqual({ fromBar: 2, toBar: 2, repeats: 4, speed: 1, metronome: true, subdivision: 2, countInBars: 1, wait: true, demo: false, guide: false });
    const demo = takeOptions({ chart: singles, options: { ...PLAY_DEFAULTS, wait: true }, section: null, demo: true, repeats: 1 });
    expect(demo).toMatchObject({ fromBar: 1, toBar: 2, repeats: 1, wait: false, demo: true });
  });
});

describe('the run a take saves', () => {
  it('plays a take through the core engine and saves the web run shape', async () => {
    const clock = createFakeClock(1000), audio = createFakeAudioPort(clock);
    const fns = new Set<(h: Hit) => void>();
    const opts = takeOptions({ chart: singles, options: { ...PLAY_DEFAULTS, chartId: 'singles', repeats: 1, countInBars: 0 }, section: { from: 1, to: 1 } });
    const take = createTake({ clock, audio, onHit: fn => { fns.add(fn); return () => { fns.delete(fn); }; }, settings: () => ({ latencyMs: 0, countIn: false, liveTips: 'off', chattiness: 'normal' }), wallClock: () => Date.UTC(2026, 9, 30) }, singles, opts);
    const done: Finished[] = [];
    take.onFinish(f => done.push(f));
    await take.start();
    const beat = 60000 / 70, z = take.state.zero;
    const strokes = Array.from({ length: 16 }, (_, i) => z + (i * beat) / 4 + 3);
    for (let now = clock.now() + 50; now < z + 5 * beat && take.state.phase === 'playing'; now += 50) {
      while (strokes.length && strokes[0] <= now) { const t = strokes.shift()!; clock.set(t); fns.forEach(f => f({ note: 38, velocity: 80, time: t, pad: 'snare' })); }
      clock.set(now); take.tick(now);
    }
    expect(done).toHaveLength(1);
    const rec = runRecord(done[0], 'singles')!;
    expect(RunInputSchema.safeParse(rec).success).toBe(true);
    expect(rec).toMatchObject({ chartId: 'singles', chartTitle: 'Single strokes (16ths)', bpm: 70, speed: 1, accuracy: 100 });
    expect(rec.take?.hits).toHaveLength(16);
    expect(rec.summary).toHaveProperty('notes', 16);
    expect(runRecord({ ...done[0], options: { ...done[0].options, wait: true } }, 'singles')).toBeNull();
  });
});

describe("Practice's sheet during and after a take", () => {
  it('colours the run as each stroke is judged (the results feed) and replays the finished take', async () => {
    const clock = createFakeClock(1000), audio = createFakeAudioPort(clock);
    const fns = new Set<(h: Hit) => void>();
    const feed = createResultsFeed(() => 0);
    const seen: PlayResult[] = [];
    feed.subscribe(r => seen.push(r));
    const opts = takeOptions({ chart: singles, options: { ...PLAY_DEFAULTS, chartId: 'singles', repeats: 2, countInBars: 0 }, section: { from: 1, to: 1 } });
    const ref: { take?: ReturnType<typeof createTake> } = {};
    const take = createTake({
      clock, audio, settings: () => ({ latencyMs: 0, countIn: false, liveTips: 'off', chattiness: 'normal' }),
      onHit: fn => { const g = (h: Hit) => { fn(h); feed.afterHit(ref.take?.state, h); }; fns.add(g); return () => { fns.delete(g); }; },
    }, singles, opts);
    ref.take = take;
    feed.reset(take.state);
    const done: Finished[] = [];
    take.onFinish(f => done.push(f));
    await take.start();
    expect(runChart(take.state)?.bars).toBe(2); // bar 1, twice round: the sheet draws the run
    const beat = 60000 / 70, z = take.state.zero;
    const strokes = Array.from({ length: 16 }, (_, i) => z + (i * beat) / 4 + 3); // the first round only
    for (let now = clock.now() + 50; now < z + 10 * beat && take.state.phase === 'playing'; now += 50) {
      while (strokes.length && strokes[0] <= now) { const t = strokes.shift()!; clock.set(t); fns.forEach(f => f({ note: 38, velocity: 80, time: t, pad: 'snare' })); }
      clock.set(now); take.tick(now); feed.misses(take.state, now);
    }
    const judged = seen.flatMap(r => (r.kind === 'judged' ? [r] : []));
    expect(judged.filter(r => r.judgement !== 'miss').map(r => r.index)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(judged.some(r => r.judgement === 'miss')).toBe(true); // the silent second round
    expect(done).toHaveLength(1);
    expect(takenChart(done[0]).notes).toHaveLength(32);
    const replay: PlayResult[] = [];
    replayResults(done[0])(r => { replay.push(r); });
    expect(replay.filter(r => r.kind === 'judged')).toHaveLength(32);
  });
});
