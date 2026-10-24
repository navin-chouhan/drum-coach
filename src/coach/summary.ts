import type { Finished } from '../play/player';

const COUNT = ['', 'e', '&', 'a'];
const slotName = (i: number) => `beat ${Math.floor(i / 4) + 1}${COUNT[i % 4] ? ' ' + COUNT[i % 4] : ''}`;

/** Compact, model-friendly summary of a run (no raw MIDI). */
export function summarizeRun(f: Finished) {
  const s = f.stats;
  const weakSpots = s.heat
    .map((c, i) => ({ position: slotName(i), notes: c.total, missed: c.miss, avgAbsOffsetMs: c.meanAbsOffset, badness: c.total ? c.miss / c.total + c.meanAbsOffset / 60 : 0 }))
    .filter(c => c.notes > 0).sort((a, b) => b.badness - a.badness).slice(0, 3)
    .map(c => ({ position: c.position, notes: c.notes, missed: c.missed, avgAbsOffsetMs: c.avgAbsOffsetMs }));
  return {
    exercise: { id: (f.chart as { id?: string }).id, title: f.chart.title, kind: f.chart.kind, level: f.chart.level, timeSignature: f.chart.timeSignature.join('/') },
    tempo: { bpm: Math.round(f.chart.bpm * f.options.speed), chartBpm: f.chart.bpm, speedPct: Math.round(f.options.speed * 100) },
    section: { fromBar: f.options.fromBar, toBar: f.options.toBar, repeats: f.options.repeats },
    notes: s.total, accuracyPct: s.accuracy, perfect: s.perfect, good: s.good, missed: s.miss, extraHits: s.extra,
    meanOffsetMs: s.meanOffset, spreadMs: s.spread,
    perDrum: Object.fromEntries(Object.entries(s.perDrum).map(([d, v]) => [d, { notes: v.total, accuracyPct: v.accuracy, meanOffsetMs: v.meanOffset }])),
    velocity: s.velocity, weakSpots,
    ...(f.options.lesson && { lesson: f.options.lesson }),
    ...(f.cues.length && { liveTips: f.cues.map(c => c.text) }),
  };
}
