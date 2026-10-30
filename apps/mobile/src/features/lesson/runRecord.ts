// A finished take as the run Storage keeps (the web's POST /api/runs body, core RunRecordSchema), and the compact
// summary the coach reads. summarizeRun is copied from src/coach/summary.ts and the record from src/play/Results.tsx
// saveRun, for a later move to core.
import { heatSlotName } from '@drum-coach/core/engine/scoring';
import type { RunInput } from '../../data/runs';
import type { Finished } from './types';

/** Compact, model-friendly summary of a run (no raw MIDI). */
export function summarizeRun(f: Finished) {
  const s = f.stats;
  const weakSpots = s.heat
    .map((c, i) => ({ position: heatSlotName(i, s.heat.length, f.run.beatsPerBar), notes: c.total, missed: c.miss, avgAbsOffsetMs: c.meanAbsOffset, badness: c.total ? c.miss / c.total + c.meanAbsOffset / 60 : 0 }))
    .filter(c => c.notes > 0).sort((a, b) => b.badness - a.badness).slice(0, 3)
    .map(c => ({ position: c.position, notes: c.notes, missed: c.missed, avgAbsOffsetMs: c.avgAbsOffsetMs }));
  return {
    exercise: { id: (f.chart as { id?: string }).id, title: f.chart.title, kind: f.chart.kind, level: f.chart.level, timeSignature: f.chart.timeSignature.join('/') },
    tempo: { bpm: Math.round(f.chart.bpm * f.options.speed), chartBpm: f.chart.bpm, speedPct: Math.round(f.options.speed * 100) },
    section: { fromBar: f.options.fromBar, toBar: f.options.toBar, repeats: f.options.repeats },
    notes: s.total, accuracyPct: s.accuracy, perfect: s.perfect, good: s.good, missed: s.miss, extraHits: s.extra,
    meanOffsetMs: s.meanOffset, spreadMs: s.spread,
    perDrum: Object.fromEntries(Object.entries(s.perDrum).map(([d, v]) => [d, { notes: v.total, accuracyPct: v.accuracy, meanOffsetMs: v.meanOffset }])),
    velocity: s.velocity, weakSpots, ...(s.grace && { graceNotes: s.grace }),
    ...(f.options.lesson && { lesson: f.options.lesson }),
    ...(f.cues.length && { liveTips: f.cues.map(c => c.text), tipIds: f.cues.map(c => c.id) }),
  };
}

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
    summary: { ...summarizeRun(f), ...extra, ...(f.interrupted && { interrupted: true }) },
    // N8: keep the take (own MIDI only) to replay it against a later one
    take: {
      beatMs, beats: f.run.beats, beatsPerBar: f.run.beatsPerBar, timeSignature: c.timeSignature,
      hits: f.hits.slice(0, 4000).map(h => [Math.round((h.time - f.zero) * 10) / 10, h.pad ?? 'snare', h.velocity] as [number, string, number]),
    },
  };
}
