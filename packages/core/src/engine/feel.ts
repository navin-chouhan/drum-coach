import type { ChartDrum } from './chart.ts';
import type { Run } from './run.ts';
import type { DrumStats, NoteResult } from './scoring.ts';

// Feel (R4): what a drummer means by groove beyond "on time". Pure functions over a scored take.

/**
 * Swing %: where the off-beat lands between two downbeats, from each on-beat note and the next note on the same drum
 * inside that beat, both played: ((t_off − t_on) / beat) × 100. 50 = straight, 67 = triplet swing. Null below 4 pairs.
 */
export function swingPct(run: Run, results: NoteResult[], beatMs: number): number | null {
  const pairs: number[] = [];
  run.notes.forEach((n, i) => {
    if (Math.abs(n.pos - Math.round(n.pos)) > 1e-6 || results[i].offset === undefined) return;
    let j = i + 1; // the next note on this drum, inside this beat (notes are in time order)
    while (j < run.notes.length && run.notes[j].t < n.t + 1 - 1e-6 && (run.notes[j].drum !== n.drum || run.notes[j].t <= n.t + 1e-6)) j++;
    const m = run.notes[j];
    if (!m || m.drum !== n.drum || m.t >= n.t + 1 - 1e-6 || results[j].offset === undefined) return;
    pairs.push(((m.t - n.t) * beatMs + results[j].offset! - results[i].offset) / beatMs * 100);
  });
  return pairs.length >= 4 ? Math.round((pairs.reduce((a, b) => a + b, 0) / pairs.length) * 10) / 10 : null;
}

const MIN_RANGE = 0.15; // bar-to-bar volume change under 15% of the take's mean is "flat"
/**
 * Bar dynamics: does the volume follow the chart's marks (`targets[bar]`, 1 soft … 3 loud, 0-based run bars)? Each
 * drum's velocity is divided by its own take mean (a kick isn't louder than a hi-hat by mistake), bars are averaged and
 * correlated with the marks (Pearson r). 0 when played flat; null when the marks don't change or fewer than 3 bars.
 */
export function barDynamics(run: Run, results: NoteResult[], targets: (number | undefined)[]): number | null {
  const byDrum = new Map<ChartDrum, number[]>();
  run.notes.forEach((n, i) => { const v = results[i].velocity; if (results[i].offset !== undefined && v) byDrum.set(n.drum, [...(byDrum.get(n.drum) ?? []), v]); });
  const drumMean = new Map([...byDrum].map(([d, vs]) => [d, vs.reduce((a, b) => a + b, 0) / vs.length]));
  const sum = new Map<number, number[]>();
  run.notes.forEach((n, i) => { const v = results[i].velocity; if (results[i].offset !== undefined && v) sum.set(n.bar, [...(sum.get(n.bar) ?? []), v / drumMean.get(n.drum)!]); });
  const bars = [...sum.keys()].filter(b => targets[b] !== undefined).sort((a, b) => a - b);
  const x = bars.map(b => targets[b]!), y = bars.map(b => sum.get(b)!.reduce((a, c) => a + c, 0) / sum.get(b)!.length);
  if (bars.length < 3 || Math.max(...x) === Math.min(...x)) return null;
  if (Math.max(...y) - Math.min(...y) < MIN_RANGE) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / x.length, my = y.reduce((a, b) => a + b, 0) / y.length;
  const cov = x.reduce((a, xi, k) => a + (xi - mx) * (y[k] - my), 0);
  const sx = Math.sqrt(x.reduce((a, xi) => a + (xi - mx) ** 2, 0)), sy = Math.sqrt(y.reduce((a, yi) => a + (yi - my) ** 2, 0));
  return Math.round((cov / (sx * sy)) * 100) / 100;
}

/** Playing behind or on top of the beat on purpose: one drum's (or the whole take's) mean offset within ms ± tol. */
export function offsetOnTarget(s: { meanOffset: number; perDrum: Partial<Record<ChartDrum, DrumStats>> }, target: { drum?: ChartDrum; ms: number; tol: number }) {
  const offset = target.drum ? s.perDrum[target.drum]?.meanOffset ?? s.meanOffset : s.meanOffset;
  return { ok: Math.abs(offset - target.ms) <= target.tol, offset };
}
