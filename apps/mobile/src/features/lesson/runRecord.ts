// A finished take as the run Storage keeps (the web's POST /api/runs body, core RunRecordSchema), ported from
// src/play/Results.tsx saveRun. The summary is the coach's (A7e summarizeTake), so the coach and the run agree.
import type { RunInput } from '../../data/runs';
import { summarizeTake } from '../coach/summary';
import type { Finished } from './types';

/** Wait-mode and empty runs aren't saved: they'd distort progress. A take of only your own bars is (D3). */
export const shouldSave = (f: Finished) => !f.options.wait && !(f.stats.total === 0 && !f.hits.length);

/**
 * The run record (saveRun's body). `extra` lands in the summary (passed, onBeatPct). An interrupted take (D6) carries
 * `interrupted: true` in its summary, so the ladder, streaks and progression can leave it out.
 */
export function runInputOf(f: Finished, extra: { passed?: boolean; onBeatPct?: number; interrupted?: boolean } = {}): RunInput {
  const s = f.stats, c = f.chart as typeof f.chart & { id?: string };
  const beatMs = 60000 / (c.bpm * f.options.speed);
  return {
    chartId: (c.id ?? c.title).slice(0, 80), chartTitle: c.title.slice(0, 200), ...(c.level !== undefined && { level: c.level }), startedAt: f.startedAt, durationS: f.durationS,
    bpm: c.bpm * f.options.speed, speed: f.options.speed, accuracy: s.total ? s.accuracy : extra.onBeatPct ?? 0, meanOffset: s.meanOffset, spread: s.spread,
    summary: { ...summarizeTake(f, { chartId: c.id, lesson: f.options.lesson }), ...extra, ...(f.interrupted && { interrupted: true }) },
    // N8: keep the take (own MIDI only) to replay it against a later one
    take: {
      beatMs, beats: f.run.beats, beatsPerBar: f.run.beatsPerBar, timeSignature: c.timeSignature,
      hits: f.hits.slice(0, 4000).map(h => [Math.round((h.time - f.zero) * 10) / 10, h.pad ?? 'snare', h.velocity] as [number, string, number]),
    },
  };
}
