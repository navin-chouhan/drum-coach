// Practice's take options and the run a finished take saves (the web's start() options and Results.saveRun body). Pure.
import type { Finished, TakeOptions } from '@drum-coach/core/play/take';
import type { RunInput } from '../../data/runs';
import { summarizeTake } from '../coach/summary';
import type { PracticeChart } from './catalog';
import { sectionRange, type PracticeOptions, type Section } from './play';

export type TakeRequest = {
  chart: PracticeChart;
  options: PracticeOptions;
  section: Section;
  /** A demo: the app plays the exercise (Hear it). */
  demo?: boolean;
  /** Times round, for the warm-up (about a minute). */
  repeats?: number;
  hints?: boolean;
};

/** The take's options from Practice's (the web's start(c, { ...o, speed, fromBar, toBar, … })). */
export function takeOptions(req: TakeRequest): TakeOptions {
  const { from, to } = sectionRange(req.section, req.chart.bars);
  const o = req.options;
  return {
    fromBar: from, toBar: to, repeats: req.repeats ?? o.repeats, speed: o.speed,
    metronome: o.metronome, subdivision: o.subdivision === 2 ? 2 : o.subdivision === 4 ? 4 : 1, countInBars: o.countInBars,
    wait: req.demo ? false : o.wait, demo: !!req.demo, guide: !!o.guide,
  };
}

/** What a finished take saves (the web's POST /api/runs body), or null for a wait-mode or empty take. */
export function runRecord(f: Finished, chartId: string): RunInput | null {
  const s = f.stats, c = f.chart as PracticeChart;
  if (f.options.wait || (s.total === 0 && !f.hits.length)) return null;
  const bpm = c.bpm * f.options.speed;
  return {
    chartId, chartTitle: c.title, ...(c.level !== undefined && { level: c.level }), startedAt: f.startedAt, durationS: f.durationS,
    bpm, speed: f.options.speed, accuracy: s.total ? s.accuracy : 0, meanOffset: s.meanOffset, spread: s.spread,
    summary: { ...summarizeTake(f, { chartId }), ...(f.interrupted && { interrupted: true }) },
    take: { beatMs: 60000 / bpm, beats: f.run.beats, beatsPerBar: f.run.beatsPerBar, timeSignature: c.timeSignature,
      hits: f.hits.slice(0, 4000).map(h => [Math.round((h.time - f.zero) * 10) / 10, h.pad ?? 'snare', h.velocity] as [number, string, number]) },
  };
}

