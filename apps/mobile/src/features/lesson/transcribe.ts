// Transcription's model (web src/lesson/Transcribe.tsx, N7): hear a groove, write it on a grid (the drums the chart
// uses × its steps), check it against the chart. 80% passes; after two checks "Show me" fills in the answer. The
// score, the rows, their names, the steps and the pass mark are core's (engine/transcribe.ts), shared with the web.
// Pure: Transcribe.tsx draws it.
import { beatsPerBar, type Chart, type ChartDrum } from '@drum-coach/core/engine/chart';
import { GRID_ROW_NAME, GRID_ROWS as ROWS, gridScore, gridStepsOf, TRANSCRIBE_PASS } from '@drum-coach/core/engine/transcribe';

export const PASS = TRANSCRIBE_PASS;
export const LANE_NAME = GRID_ROW_NAME;
/** Steps per beat: 8ths, 16ths or triplets, whichever fits every note. */
export const stepsOf = gridStepsOf;

export const cellKey = (d: ChartDrum, c: number) => `${d}:${c}`;

export type CellState = '' | 'right' | 'wrong' | 'missed';

/** The grid: its lanes, columns and the head over each column ("1 e & a", "1 &", "1 . ."). */
export function gridOf(chart: Chart) {
  const spb = stepsOf(chart), bpb = beatsPerBar(chart), cols = chart.bars * bpb * spb;
  const lanes = ROWS.filter(d => chart.notes.some(n => n.drum === d));
  const heads = Array.from({ length: cols }, (_, c) => (c % spb === 0 ? String(((c / spb) % bpb) + 1) : spb === 3 ? '' : spb === 2 ? '&' : ['', 'e', '&', 'a'][c % spb]));
  const answer = new Set(chart.notes.map(n => cellKey(n.drum, Math.round(n.t * spb))));
  return { spb, bpb, cols, lanes, heads, answer };
}

/** Checks what's written: the score and whether it passes. */
export function checkGrid(cells: ReadonlySet<string>, chart: Chart, spb: number) {
  const written = [...cells].map(k => { const [d, c] = k.split(':'); return { drum: d as ChartDrum, t: Number(c) / spb }; });
  const score = gridScore(written, chart.notes, spb);
  return { ...score, ok: score.pct >= PASS };
}

/** A cell after a check: right, wrong (written but not there), missed (there but not written). */
export function cellState(checked: boolean, on: boolean, inAnswer: boolean): CellState {
  if (!checked) return '';
  return on ? (inAnswer ? 'right' : 'wrong') : inAnswer ? 'missed' : '';
}

/** The line after a check. */
export const checkLine = (s: { pct: number; right: number; missed: number; extra: number; ok: boolean }) =>
  `${s.pct}% right: ${s.right} right, ${s.missed} missing${s.extra ? `, ${s.extra} that aren't there` : ''}.${s.ok ? ' You wrote it down by ear!' : ' Dotted boxes are missing, red ones are extra. Listen again and fix them.'}`;
