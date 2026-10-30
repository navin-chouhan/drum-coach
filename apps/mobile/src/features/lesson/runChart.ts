// The chart the play surfaces draw for a take: its run (every bar of every repeat), so a result's index is the run
// note's index, and the idle chart before a take. Pure.
import type { Chart } from '@drum-coach/core/engine/chart';
import type { ChartLike } from '../../play/chartLike';
import type { PlayResult, Subscribe } from '../../play/events';
import type { Finished, TakeState } from './types';

/** The take's run as a chart (bars = the run's bars). */
export function runChart(s: Pick<TakeState, 'chart' | 'run'>): ChartLike | undefined {
  if (!s.chart || !s.run) return undefined;
  return { title: s.chart.title, bpm: s.chart.bpm, timeSignature: s.chart.timeSignature, bars: Math.max(1, Math.ceil(s.run.beats / s.run.beatsPerBar - 1e-6)), notes: s.run.notes };
}

/** The chart before a take: the step's chart, with the app-played notes left out of nothing (the sheet dims them). */
export const idleChart = (c: Chart): ChartLike => ({ title: c.title, bpm: c.bpm, timeSignature: c.timeSignature, bars: c.bars, notes: c.notes });

/** A finished take's scored run as a chart (your notes, every bar played): the sheet after a take. */
export const takenChart = (f: Finished): ChartLike => ({
  title: f.chart.title, bpm: f.chart.bpm, timeSignature: f.chart.timeSignature, bars: Math.max(1, Math.ceil(f.run.beats / f.run.beatsPerBar - 1e-6)), notes: f.run.notes,
});

/**
 * A finished take's results as a stream that replays them to each listener (the sheet after a take), indexed into
 * takenChart(f). Extra strokes are already latency-corrected: draw them with latencyMs 0.
 */
export function replayResults(f: Finished): Subscribe<PlayResult> {
  const events: PlayResult[] = [];
  f.run.notes.forEach((n, k) => {
    const r = f.results[k];
    if (!r) return;
    const lane = n.drum === 'hhOpen' || n.drum === 'hhPedal' ? 'hihat' : n.drum;
    events.push({ kind: 'judged', index: k, lane, judgement: r.judgement, offsetMs: r.offset ?? r.off, at: f.zero + n.t * (60000 / (f.chart.bpm * f.options.speed)) });
  });
  for (const h of f.extras) if (h.pad) events.push({ kind: 'extra', lane: h.pad === 'hhClosed' || h.pad === 'hhOpen' || h.pad === 'hhPedal' ? 'hihat' : h.pad, at: h.time, pad: h.pad });
  return fn => { events.forEach(fn); return () => {}; };
}
