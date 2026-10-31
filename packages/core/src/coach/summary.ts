import type { Chart } from '../engine/chart.ts';
import type { Cue } from '../engine/liveCoach.ts';
import type { Run } from '../engine/run.ts';
import { heatSlotName, type RunStats } from '../engine/scoring.ts';

// A compact, model-friendly summary of a take (no raw MIDI): what the coach routes read (POST /api/coach/feedback,
// the session's `take` event) and what a saved run keeps as summary_json. One copy for the web (src/coach/summary.ts
// summarizeRun) and the iPad (features/coach/summary.ts summarizeTake).

/** What a summary reads of a finished take (the web player's or the core take's Finished). */
export type SummaryTake = {
  stats: RunStats; run: Pick<Run, 'beatsPerBar'>; chart: Chart; cues: Pick<Cue, 'id' | 'text'>[];
  options: { speed: number; fromBar: number; toBar: number; repeats: number };
};

/** What the take's options may not carry: the chart's id (else the chart's own) and the lesson metadata. */
export type SummaryExtras<L extends object = Record<string, unknown>> = { chartId?: string; lesson?: L };

export function summarizeTake<L extends object = Record<string, unknown>>(f: SummaryTake, extra: SummaryExtras<L> = {}) {
  const s = f.stats;
  const weakSpots = s.heat
    .map((c, i) => ({ position: heatSlotName(i, s.heat.length, f.run.beatsPerBar), notes: c.total, missed: c.miss, avgAbsOffsetMs: c.meanAbsOffset, badness: c.total ? c.miss / c.total + c.meanAbsOffset / 60 : 0 }))
    .filter(c => c.notes > 0).sort((a, b) => b.badness - a.badness).slice(0, 3)
    .map(c => ({ position: c.position, notes: c.notes, missed: c.missed, avgAbsOffsetMs: c.avgAbsOffsetMs }));
  const id = extra.chartId ?? (f.chart as { id?: string }).id;
  return {
    exercise: { id, title: f.chart.title, kind: f.chart.kind, level: f.chart.level, timeSignature: f.chart.timeSignature.join('/') },
    tempo: { bpm: Math.round(f.chart.bpm * f.options.speed), chartBpm: f.chart.bpm, speedPct: Math.round(f.options.speed * 100) },
    section: { fromBar: f.options.fromBar, toBar: f.options.toBar, repeats: f.options.repeats },
    notes: s.total, accuracyPct: s.accuracy, perfect: s.perfect, good: s.good, missed: s.miss, extraHits: s.extra,
    meanOffsetMs: s.meanOffset, spreadMs: s.spread,
    perDrum: Object.fromEntries(Object.entries(s.perDrum).map(([d, v]) => [d, { notes: v.total, accuracyPct: v.accuracy, meanOffsetMs: v.meanOffset }])),
    velocity: s.velocity, weakSpots, ...(s.grace && { graceNotes: s.grace }),
    ...(extra.lesson && { lesson: extra.lesson }),
    ...(f.cues.length && { liveTips: f.cues.map(c => c.text), tipIds: f.cues.map(c => c.id) }),
  };
}

export type TakeSummary = ReturnType<typeof summarizeTake<Record<string, unknown>>>;
