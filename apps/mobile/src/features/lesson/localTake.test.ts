import { describe, expect, it } from 'vitest';
import { LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import { playAll, rig } from './fakes.testutil';
import type { PlayOptions } from './types';

const money = LESSON_BY_ID['money-8ths'].steps[2]; // + snare: hi-hat, kick, snare, 1 bar
const opts = (o: Partial<PlayOptions> = {}): PlayOptions => ({ fromBar: 1, toBar: 1, repeats: 4, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false, ...o });

describe('local take (scored as src/play/player.ts)', () => {
  it('scores a clean take and finishes after the last beat', () => {
    const r = rig();
    r.take.start(money.chart, opts());
    expect(r.take.state.phase).toBe('playing');
    expect(r.take.state.zero).toBe(1000 + 300 + 4 * (60000 / money.chart.bpm));
    playAll(r);
    const f = r.take.state.finished!;
    expect(r.take.state.phase).toBe('done');
    expect(f.stats.total).toBe(48);
    expect(f.stats.accuracy).toBe(100);
    expect(f.stats.perfect).toBe(48);
    expect(f.extras).toHaveLength(0);
  });

  it('gives the same results with every time shifted by 1e9 ms', () => {
    const off = (i: number) => (i % 9 === 4 ? undefined : ((i * 37) % 61) - 30);
    const a = rig(), b = rig({ start: 1e9 });
    a.take.start(money.chart, opts()); playAll(a, off);
    b.take.start(money.chart, opts()); playAll(b, off);
    const fa = a.take.state.finished!, fb = b.take.state.finished!;
    expect(fb.stats).toEqual(fa.stats);
    expect(fb.results).toEqual(fa.results);
  });

  it('removes the latency from every stroke', () => {
    const r = rig({ latencyMs: 25 });
    r.take.start(money.chart, opts());
    playAll(r, () => 25);
    expect(r.take.state.finished!.stats.perfect).toBe(48);
    expect(r.take.state.finished!.stats.meanOffset).toBe(0);
  });

  it('plans the count-in clicks and words, then the bar-start click', () => {
    const r = rig();
    r.take.start(money.chart, opts());
    const t0 = 1300, beat = 60000 / money.chart.bpm;
    const clicks = r.sounds.filter(e => e.kind === 'sound' && e.sound.startsWith('click.'));
    expect(clicks.slice(0, 5).map(e => [e.at, e.kind === 'sound' && e.sound])).toEqual([
      [t0, 'click.bar'], [t0 + beat, 'click.beat'], [t0 + 2 * beat, 'click.beat'], [t0 + 3 * beat, 'click.beat'], [t0 + 4 * beat, 'click.bar'],
    ]);
    expect(r.sounds.filter(e => e.kind === 'sound' && e.sound.startsWith('word.')).map(e => e.kind === 'sound' && e.sound)).toEqual(['word.one', 'word.two', 'word.three', 'word.four']);
  });

  it('wait mode moves to the next group once it is played, and finishes on the last', () => {
    const r = rig();
    const step = LESSON_BY_ID['count-quarters'].steps[0];
    r.take.start(step.chart, opts({ repeats: 1, wait: true }));
    expect(r.take.position()).toBeCloseTo(-0.5);
    r.clock.advance(5000);
    expect(r.take.position()).toBe(0); // waits at the first note
    r.bus.emit('snare', r.clock.now());
    r.clock.advance(5000);
    expect(r.take.position()).toBe(1);
    for (let i = 0; i < 3; i++) r.bus.emit('snare', r.clock.now());
    expect(r.take.state.phase).toBe('done');
    expect(r.take.state.finished!.options.wait).toBe(true);
  });

  it('an endless take keeps its whole bars on Stop', () => {
    const r = rig();
    r.take.start(money.chart, opts({ endless: true }));
    const beat = r.take.state.beatMs;
    playAll(r, () => 0, r.take.state.zero + 10.5 * beat); // 2 bars and a half
    r.take.stop('user');
    const f = r.take.state.finished!;
    expect(f.run.beats).toBe(8);
    expect(f.stats.total).toBe(24);
    expect(f.interrupted).toBeUndefined();
  });

  it('an interrupted take (D6) ends at its last whole bar, flagged', () => {
    const r = rig();
    r.take.start(money.chart, opts());
    playAll(r, () => 0, r.take.state.zero + 9 * r.take.state.beatMs); // into bar 3
    r.take.stop('interrupted');
    const f = r.take.state.finished!;
    expect(f.interrupted).toEqual({});
    expect(f.run.beats).toBe(8);
    expect(f.stats.accuracy).toBe(100);
  });

  it('a plain Stop drops a take and cancels its sounds', () => {
    const r = rig();
    r.take.start(money.chart, opts());
    r.take.stop();
    expect(r.take.state.phase).toBe('idle');
    expect(r.take.state.finished).toBeUndefined();
    expect(r.cancels()).toBeGreaterThan(0);
    expect(r.bus.size()).toBe(0);
  });

  it('a demo plays every note, is not scored and runs `then` at its end', () => {
    const r = rig();
    let then = 0;
    r.take.start(money.chart, opts({ repeats: 1, demo: true, then: () => { then++; } }));
    playAll(r, () => undefined);
    expect(r.sounds.filter(e => e.kind === 'sound' && e.sound.startsWith('drum.'))).toHaveLength(12);
    expect(then).toBe(1);
    expect(r.take.state.phase).toBe('idle');
  });

  it('ignores strokes queued before the take started', () => {
    const r = rig();
    r.take.start(money.chart, opts({ repeats: 1 }));
    r.bus.emit('snare', 500);
    playAll(r);
    expect(r.take.state.finished!.hits).toHaveLength(12);
  });

  it('streams judged notes, extras and misses for the play surfaces', () => {
    const r = rig();
    const got: string[] = [];
    r.take.results(e => got.push(e.kind === 'extra' ? `extra:${e.lane}` : `${e.index}:${e.judgement}`));
    r.take.start(money.chart, opts({ repeats: 1 }));
    const zero = r.take.state.zero;
    r.clock.set(zero + 4 * r.take.state.beatMs); // nothing played: every note's window has passed, the take still runs
    r.take.tick();
    expect(got).toHaveLength(12);
    expect(new Set(got.map(g => g.split(':')[1]))).toEqual(new Set(['miss']));
    r.bus.emit('tom1', r.clock.now());
    expect(got.at(-1)).toBe('extra:tom1');
  });
});
