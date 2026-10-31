// A finished take's details (the web's Results, src/play/Results.tsx): the head line, accuracy, timing, dynamics,
// per drum, where in the bar (the timing heat map) and the tips during the take. Pure: the screen
// (ResultsDetails.tsx) lays it out with the UI kit. The wording and the numbers are the web's: the drum names, the
// timing words, the latency line and the heat formula are core's, shared with the web.
import { DRUM_NAME } from '@drum-coach/core/content/drums';
import type { DrumId } from '@drum-coach/core/engine/kit';
import { heatBad, LATENCY_PATH_IPAD, latencyLine as coreLatencyLine, timingText } from '@drum-coach/core/engine/results';
import { heatSlotName } from '@drum-coach/core/engine/scoring';
import type { Finished } from '@drum-coach/core/play/take';

export { DRUM_NAME, timingText };

/** The web's latency hint, with the iPad's path to the test (Setup → Latency → Measure; QA4 m4). */
export const latencyLine = (f: Parameters<typeof coreLatencyLine>[0]) => coreLatencyLine(f, LATENCY_PATH_IPAD);

export type DetailsTake = Pick<Finished, 'chart' | 'options' | 'stats' | 'run' | 'results' | 'cues'>;

export const laneOf = (d: string) => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d) as DrumId;

export type DrumRow = { drum: string; lane: DrumId; name: string; accuracy: number };
export type HeatView = { label: string; total: number; bad: number; color: string; detail: string };

export type DetailsView = {
  title: string; sub: string; wait: boolean;
  accuracy: { big: string; perfect: number; good: number; miss: number; extra: number; waitNote?: string };
  timing?: { big: string; small: string; latency?: string };
  dynamics: { big: string; small: string };
  perDrum: DrumRow[];
  heat: HeatView[];
  tips: string[];
};

/** A heat cell's colour (the web's: green = solid, red = missed or off-time; empty cells use `empty`). */
export function heatColor(c: { total: number; miss: number; meanAbsOffset: number }, empty: string): { bad: number; color: string } {
  if (!c.total) return { bad: 0, color: empty };
  const bad = heatBad(c);
  return { bad, color: `hsl(${Math.round(140 - 140 * bad)}, 60%, ${Math.round(30 + 10 * (1 - bad))}%)` };
}

export function detailsView(f: DetailsTake, emptyHeat = '#E9E4D6'): DetailsView {
  const s = f.stats, o = f.options, wait = !!o.wait;
  const slotLabel = (i: number) => { const [, beat, count] = heatSlotName(i, s.heat.length, f.run.beatsPerBar).split(' '); return count ?? beat; }; // "2", "&", "let"
  const v = s.velocity;
  return {
    title: f.chart.title,
    sub: `${Math.round(f.chart.bpm * o.speed)} BPM (${Math.round(o.speed * 100)}%) · bars ${o.fromBar}–${o.toBar} × ${o.repeats ?? 1}${wait ? ' · wait mode' : ''}${o.guide ? ' · play-along' : ''}`,
    wait,
    accuracy: {
      big: wait ? `${s.extra} wrong` : `${s.accuracy}%`, perfect: s.perfect, good: s.good, miss: s.miss, extra: s.extra,
      ...(wait && { waitNote: `Wait mode doesn't score timing. ${s.total} notes played.` }),
    },
    ...(!wait && { timing: { big: timingText(s.meanOffset), small: `Consistency: ±${Math.round(s.spread)} ms (lower is steadier)`, latency: latencyLine(f) } }),
    dynamics: {
      big: v.normalMean ? String(v.normalMean) : '—',
      small: `Average velocity · variation ${v.normalCv}%${v.accentMean !== null ? ` · accents ${v.accentMean}` : ''}${v.ghostMean !== null ? ` · ghosts ${v.ghostMean}` : ''}`,
    },
    perDrum: wait ? [] : Object.entries(s.perDrum).map(([d, x]) => ({
      drum: d, lane: laneOf(d), accuracy: x!.accuracy,
      name: d === 'hhOpen' ? 'Hi-hat open' : d === 'hhPedal' ? 'Hi-hat foot' : DRUM_NAME[laneOf(d)],
    })),
    heat: wait ? [] : s.heat.map((c, i) => {
      const { bad, color } = heatColor(c, emptyHeat);
      return { label: slotLabel(i), total: c.total, bad, color,
        detail: c.total ? `${heatSlotName(i, s.heat.length, f.run.beatsPerBar)}: ${c.total} notes · ${c.miss} missed · avg ±${c.meanAbsOffset} ms` : `${heatSlotName(i, s.heat.length, f.run.beatsPerBar)}: no notes` };
    }),
    tips: f.cues.map(c => c.text),
  };
}
