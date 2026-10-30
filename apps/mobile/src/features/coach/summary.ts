// Copied from src/coach/summary.ts (web) for the core take result (@drum-coach/core/play/take TakeResult). Move to
// core with the web's copy once the web's player becomes the take adapter (one summary for both).
//
// A compact, model-friendly summary of a take (no raw MIDI): what the coach routes read (POST /api/coach/feedback,
// the session's `take` event) and what a saved run keeps as summary_json.
import { heatSlotName } from '@drum-coach/core/engine/scoring';
import type { TakeResult } from '@drum-coach/core/play/take';

/** What the web's PlayOptions carried and the core take doesn't: the chart's id and the lesson metadata. */
export type TakeExtras = { chartId?: string; lesson?: Record<string, unknown> };

export type RunSummary = ReturnType<typeof summarizeTake>;

export function summarizeTake(f: Pick<TakeResult, 'stats' | 'run' | 'chart' | 'options' | 'cues'>, extra: TakeExtras = {}) {
  const s = f.stats;
  const speed = f.chart.bpm ? f.options.bpm / f.chart.bpm : 1;
  const weakSpots = s.heat
    .map((c, i) => ({ position: heatSlotName(i, s.heat.length, f.run.beatsPerBar), notes: c.total, missed: c.miss, avgAbsOffsetMs: c.meanAbsOffset, badness: c.total ? c.miss / c.total + c.meanAbsOffset / 60 : 0 }))
    .filter(c => c.notes > 0).sort((a, b) => b.badness - a.badness).slice(0, 3)
    .map(c => ({ position: c.position, notes: c.notes, missed: c.missed, avgAbsOffsetMs: c.avgAbsOffsetMs }));
  const id = extra.chartId ?? (f.chart as { id?: string }).id;
  return {
    exercise: { id, title: f.chart.title, kind: f.chart.kind, level: f.chart.level, timeSignature: f.chart.timeSignature.join('/') },
    tempo: { bpm: Math.round(f.options.bpm), chartBpm: f.chart.bpm, speedPct: Math.round(speed * 100) },
    section: { fromBar: f.options.fromBar, toBar: f.options.toBar, repeats: f.options.repeats },
    notes: s.total, accuracyPct: s.accuracy, perfect: s.perfect, good: s.good, missed: s.miss, extraHits: s.extra,
    meanOffsetMs: s.meanOffset, spreadMs: s.spread,
    perDrum: Object.fromEntries(Object.entries(s.perDrum).map(([d, v]) => [d, { notes: v!.total, accuracyPct: v!.accuracy, meanOffsetMs: v!.meanOffset }])),
    velocity: s.velocity, weakSpots, ...(s.grace && { graceNotes: s.grace }),
    ...(extra.lesson && { lesson: extra.lesson }),
    ...(f.cues.length && { liveTips: f.cues.map(c => c.text), tipIds: f.cues.map(c => c.id) }),
  };
}
