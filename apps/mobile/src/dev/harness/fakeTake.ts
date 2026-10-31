// Layout harness (web only): a finished take for screens that show one (Practice Details), made by the real take
// engine on a fake clock and fake audio, with fake strokes: mostly on time, some late, a few missed. No real takes.
import { DRUM_PAD, type Chart } from '@drum-coach/core/engine/chart';
import type { Hit } from '@drum-coach/core/input/hits';
import { createFakeAudioPort, createFakeClock } from '@drum-coach/core/play/fakeAudio';
import type { Finished } from '@drum-coach/core/play/take';
import { createTakePort } from '../../features/lesson/takePort';

export async function fakeFinishedTake(chart: Chart): Promise<Finished> {
  const clock = createFakeClock(1000), audio = createFakeAudioPort(clock);
  const fns = new Set<(h: Hit) => void>();
  const take = createTakePort({
    clock, audio, onHit: fn => { fns.add(fn); return () => { fns.delete(fn); }; }, wallClock: () => Date.now(),
    settings: () => ({ latencyMs: 0, liveTips: 'off', chattiness: 'normal', countIn: true }),
  });
  take.start(chart, { fromBar: 1, toBar: chart.bars, repeats: 2, speed: 1, metronome: true, subdivision: 1, countInBars: 1 } as never);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  const s = take.state, run = s.run!;
  const strokes = run.notes.flatMap((n, i) => (s.auto[i] || i % 11 === 5 ? [] : [{ pad: DRUM_PAD[n.drum][0], at: s.zero + n.t * s.beatMs + (i % 7 === 3 ? 38 : (i % 5) * 4 - 6) }]))
    .sort((a, b) => a.at - b.at);
  for (const st of strokes) {
    while (clock.now() + 100 < st.at) { clock.advance(100); take.tick(); }
    clock.set(Math.max(clock.now(), st.at));
    fns.forEach(f => f({ note: 38, velocity: 70 + (st.at % 40), time: st.at, pad: st.pad }));
  }
  const end = s.zero + run.beats * s.beatMs + 500;
  while (clock.now() < end && take.state.phase === 'playing') { clock.advance(100); take.tick(); }
  return take.state.finished as Finished;
}
