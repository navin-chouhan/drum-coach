import type { Chart, ChartDrum } from './chart.ts';
import type { Run, RunOptions } from './run.ts';
import type { NoteResult } from './scoring.ts';

// After a take, the lesson's sheet shows how each note went, right on the note (the sheet shows the chart once, the
// take played it several times: the last round is shown).

export type NoteMark = { word: string; tone: 'good' | 'ok' | 'bad' };

/** One note of a take in words: on it, (a hair) late or early, missed. */
export function markOf(r: NoteResult): NoteMark {
  if (r.judgement === 'miss') return { word: 'missed', tone: 'bad' };
  if (r.judgement === 'perfect' || r.offset === undefined) return { word: 'on it', tone: 'good' };
  return { word: `${Math.abs(r.offset) <= 45 ? 'a hair ' : ''}${r.offset > 0 ? 'late' : 'early'}`, tone: 'ok' };
}

/**
 * The take's last round mapped onto the chart's notes: chart note index → its mark, and the round's extra hits as
 * chart beats. Notes the app played (other lanes, `auto`) get no mark. `extraBeats`: every extra hit, in run beats.
 */
export function lastRound(chart: Chart, run: Run, results: NoteResult[], o: RunOptions & { activeLanes?: readonly ChartDrum[] }, extraBeats: number[]) {
  const bpb = run.beatsPerBar, start = (o.fromBar - 1) * bpb, len = (o.toBar - o.fromBar + 1) * bpb;
  const rounds = Math.max(1, Math.round(run.beats / len)), from = (rounds - 1) * len;
  const marks = new Map<number, NoteMark>();
  run.notes.forEach((n, k) => {
    if (n.t < from - 1e-6 || n.auto || (o.activeLanes && !o.activeLanes.includes(n.drum)) || !results[k]) return;
    const j = chart.notes.findIndex(c => Math.abs(c.t - (n.t - from + start)) < 1e-3 && c.drum === n.drum);
    if (j >= 0) marks.set(j, markOf(results[k]));
  });
  const extras = extraBeats.filter(b => b >= from - 1e-6 && b < from + len).map(b => b - from + start);
  // the whole take, for the timing line: where every hit landed (ms against the click), and how many notes were missed
  const mine = results.filter((r, k) => r && !run.notes[k].auto && (!o.activeLanes || o.activeLanes.includes(run.notes[k].drum)));
  const offsets = mine.flatMap(r => (r.judgement !== 'miss' && r.offset !== undefined ? [r.offset] : []));
  return { marks, extras, rounds, offsets, missed: mine.filter(r => r.judgement === 'miss').length };
}
