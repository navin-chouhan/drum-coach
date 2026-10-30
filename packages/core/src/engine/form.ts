import { beatsPerBar, type Chart } from './chart.ts';

// Road maps (N7): a chart written with repeat signs, 1st/2nd endings and "D.C. al Coda", and the bars as played.
export type Form = {
  repeat?: [number, number]; // bars from–to (1-based) are played twice
  endings?: boolean;         // the repeat's last bar is the 1st ending; the bar after it is the 2nd ending
  coda?: { toCoda: number; codaAt: number }; // after the main part, back to bar 1 (D.C.), play to `toCoda`, jump to the coda at `codaAt`
};

/** The written bars in the order they're played. */
export function playOrder(bars: number, form: Form): number[] {
  const end = form.coda ? form.coda.codaAt - 1 : bars, range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  const [a, b] = form.repeat ?? [0, 0];
  const main = form.repeat ? [...range(1, b), ...range(a, form.endings ? b - 1 : b), ...range(b + 1, end)] : range(1, end);
  if (!form.coda) return main;
  // D.C.: from the top without the repeat (the 1st ending is skipped, as on the way out), then the coda
  const again = range(1, form.coda.toCoda).filter(n => !(form.endings && n === b));
  return [...main, ...again, ...range(form.coda.codaAt, bars)];
}

/** The chart as played: each written bar copied into play order (the road map gone). */
export function expandForm<C extends Chart>(chart: C): C {
  if (!chart.form) return chart;
  const bpb = beatsPerBar(chart), order = playOrder(chart.bars, chart.form);
  const notes = order.flatMap((bar, i) => chart.notes.filter(n => n.t >= (bar - 1) * bpb - 1e-6 && n.t < bar * bpb - 1e-6).map(n => ({ ...n, t: n.t + (i - (bar - 1)) * bpb })));
  return { ...chart, form: undefined, bars: order.length, notes, ...(chart.dyn && { dyn: order.map(b => chart.dyn![b - 1] ?? 2) }) };
}
