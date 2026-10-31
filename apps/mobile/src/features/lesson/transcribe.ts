// Transcription's model (web src/lesson/Transcribe.tsx, N7): hear a groove, write it on a grid (the drums the chart
// uses × its steps), check it against the chart. 80% passes; after two checks "Show me" fills in the answer. The
// score is core's gridScore. Pure: Transcribe.tsx draws it.
import { beatsPerBar, type Chart, type ChartDrum } from '@drum-coach/core/engine/chart';
import { gridScore } from '@drum-coach/core/engine/transcribe';

export const PASS = 80;
/** The grid's drum rows, top to bottom (web src/youtube/GridEditor.tsx ROWS). */
const ROWS: ChartDrum[] = ['crash', 'ride', 'hihat', 'hhOpen', 'hhPedal', 'tom1', 'tom2', 'floor', 'snare', 'kick'];
export const LANE_NAME: Partial<Record<ChartDrum, string>> = {
  hihat: 'Hi-hat', hhOpen: 'HH open', hhPedal: 'HH foot', ride: 'Ride', crash: 'Crash', tom1: 'Tom 1', tom2: 'Tom 2', floor: 'Floor', snare: 'Snare', kick: 'Kick',
};

/** Steps per beat: 8ths, 16ths or triplets, whichever fits every note. */
export const stepsOf = (c: Chart) => [2, 4, 3].find(k => c.notes.every(n => Math.abs(n.t * k - Math.round(n.t * k)) < 1e-6)) ?? 4;

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
