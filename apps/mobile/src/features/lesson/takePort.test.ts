import { describe, expect, it } from 'vitest';
import { LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import { flush, playAll, rig } from './fakes.testutil';
import type { PlayOptions } from './types';

const money = LESSON_BY_ID['money-8ths'].steps[2]; // + snare: hi-hat, kick, snare, 1 bar
const opts = (o: Partial<PlayOptions> = {}): PlayOptions => ({ fromBar: 1, toBar: 1, repeats: 4, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false, ...o });

describe('TakePort on core createTake', () => {
  it('scores a clean take, the same at +1e9 ms', async () => {
    const off = (i: number) => (i % 9 === 4 ? undefined : ((i * 37) % 61) - 30);
    const a = rig(), b = rig({ start: 1e9 });
    a.take.start(money.chart, opts()); await playAll(a, off);
    b.take.start(money.chart, opts()); await playAll(b, off);
    const fa = a.take.state.finished!, fb = b.take.state.finished!;
    expect(a.take.state.phase).toBe('done');
    expect(fa.stats.total).toBe(48);
    expect(fb.stats).toEqual(fa.stats);
    const clean = rig();
    clean.take.start(money.chart, opts()); await playAll(clean);
    expect(clean.take.state.finished!.stats.accuracy).toBe(100);
  });

  it('streams judged notes, extras and misses for the play surfaces', async () => {
    const r = rig();
    const got: string[] = [];
    r.take.results(e => got.push(e.kind === 'extra' ? `extra:${e.lane}` : `${e.index}:${e.judgement}`));
    r.take.start(money.chart, opts({ repeats: 1 }));
    await flush();
    const s = r.take.state;
    r.bus.emit('snare', s.zero + 1 * s.beatMs); // snare on 2
    expect(got).toContain(`${s.run!.notes.findIndex(n => n.drum === 'snare')}:perfect`);
    r.bus.emit('tom1', s.zero + 1.2 * s.beatMs);
    expect(got.at(-1)).toBe('extra:tom1');
    r.clock.set(s.zero + 4 * s.beatMs);
    r.take.tick();
    expect(got.filter(g => g.endsWith(':miss'))).toHaveLength(11);
  });

  it('an interrupted take keeps its whole bars (≥ 2), flagged; shorter ones are dropped', async () => {
    const r = rig();
    r.take.start(money.chart, opts());
    await flush();
    await playAll(r, () => 0, r.take.state.zero + 9 * r.take.state.beatMs + 100);
    r.take.stop('interrupted');
    expect(r.take.state.finished).toMatchObject({ interrupted: true });
    expect(r.take.state.finished!.run.beats).toBe(8);
    const short = rig();
    short.take.start(money.chart, opts());
    await flush();
    await playAll(short, () => 0, short.take.state.zero + 5 * short.take.state.beatMs);
    short.take.stop('interrupted');
    expect(short.take.state.phase).toBe('idle');
    expect(short.take.lastEnd).toBe('dropped');
  });

  it('an interruption ends the take where native says it began, not when JS heard of it (QA2 m6)', async () => {
    const r = rig();
    r.take.start(money.chart, opts());
    await flush();
    const s = r.take.state, began = s.zero + 9 * s.beatMs + 100; // in bar 3
    await playAll(r, () => 0, s.zero + 13 * s.beatMs + 100); // JS is told late, in bar 4
    r.take.stop('interrupted', began);
    expect(r.take.state.finished!.run.beats).toBe(8); // bars 1–2, not 1–3
  });

  it('a demo runs `then` at its end; Stop drops a take', async () => {
    const r = rig();
    let then = 0;
    r.take.start(money.chart, opts({ repeats: 1, demo: true, then: () => { then++; } }));
    await playAll(r, () => undefined);
    expect(then).toBe(1);
    r.take.start(money.chart, opts());
    await flush();
    r.take.stop();
    expect(r.take.state.phase).toBe('idle');
    expect(r.bus.size()).toBe(0);
  });
});
