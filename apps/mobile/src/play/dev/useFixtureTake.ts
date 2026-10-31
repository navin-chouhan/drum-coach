// Drives the dev screen: loops a fake take of the fixture chart on a timer, replays the fixture student (optional),
// judges strokes from the touch pads too, and feeds the hit and result streams. Core-agnostic; A1/A4's createTake
// replaces it in the real lesson player.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { beatsPerBar, type ChartLike, type PadId } from '../chartLike';
import { createStream, type PadHit, type PlayResult } from '../events';
import { msPerBeat } from '../geometry';
import { createFixtureJudge, FIXTURE_WINDOWS, replayHits } from './fixture';
import { useLatest } from '../../ui/useLatest';

export type FixtureTake = {
  zero: number;
  take: number;
  hits: ReturnType<typeof createStream<PadHit>>;
  results: ReturnType<typeof createStream<PlayResult>>;
  /** For the touch pads: a stroke from a finger, judged like the replay's (touch: Good 20 ms wider). */
  emitPad: (pad: PadId, velocity: number, time: number) => void;
  restart: () => void;
};

export function useFixtureTake(chart: ChartLike, bpm: number, now: () => number, autoplay: boolean, leadMs = 1200): FixtureTake {
  const beatMs = msPerBeat(bpm), bpb = beatsPerBar(chart);
  const hits = useMemo(() => createStream<PadHit>(), []);
  const results = useMemo(() => createStream<PlayResult>(), []);
  const nextZero = useCallback(() => now() + leadMs + bpb * beatMs, [now, leadMs, bpb, beatMs]); // a lead-in, then a bar of count-in
  const [{ take, zero }, setTake] = useState(() => ({ take: 0, zero: nextZero() }));
  const restart = useCallback(() => setTake(s => ({ take: s.take + 1, zero: nextZero() })), [nextZero]);
  const judge = useMemo(() => createFixtureJudge(chart, zero, beatMs, { ...FIXTURE_WINDOWS, good: FIXTURE_WINDOWS.good + 20 }), [chart, zero, beatMs]);
  const judgeRef = useLatest(judge);

  useEffect(() => {
    const queue = autoplay ? replayHits(chart, zero, beatMs) : [];
    let next = 0;
    const end = zero + (chart.bars + 1) * bpb * beatMs;
    const id = setInterval(() => {
      const t = now();
      while (next < queue.length && queue[next].at <= t) {
        const h = queue[next++];
        hits.emit({ pad: h.pad, velocity: h.velocity, at: h.at });
        results.emit(judge.hit(h.pad, h.at));
      }
      for (const r of judge.tick(t)) results.emit(r);
      if (t > end) {
        clearInterval(id);
        restart();
      }
    }, 8);
    return () => clearInterval(id);
  }, [chart, zero, beatMs, bpb, autoplay, judge, hits, results, now, restart]);

  const emitPad = useCallback((pad: PadId, velocity: number, time: number) => {
    hits.emit({ pad, velocity, at: time });
    results.emit(judgeRef.current.hit(pad, time));
  }, [hits, results, judgeRef]);

  return { zero, take, hits, results, emitPad, restart };
}
