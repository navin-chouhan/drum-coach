// While you play: the count-in number, the bar counter, the live tip line and flow mode's meter. Ported from
// src/play/AtKit.tsx (LiveHint, BarCounter, FlowMeter); the tips themselves are the take engine's (rule-based
// engine/liveCoach.ts, never the AI in real time).
import { countInNumber } from '@drum-coach/core/engine/run';
import { recentAccuracy } from '@drum-coach/core/engine/scoring';
import type { TakeState } from './types';

/** How long a live tip stays on screen (LiveHint). */
export const TIP_MS = 3000;

/** The live tip line at Clock time `now`, or '' when none is showing. */
export const liveTip = (s: Pick<TakeState, 'cue'>, now: number) => (s.cue && now - s.cue.at < TIP_MS ? `💡 ${s.cue.cue.text}` : '');

/** The big count-in number (1 2 3 4 …) at a negative position, else undefined. */
export const countInAt = (pos: number, beatsPerBar: number) => (pos < 0 ? countInNumber(pos, beatsPerBar) : undefined);

/** "Get ready…" in the count-in, then "Bar 2 of 4". */
export function barCounter(s: Pick<TakeState, 'run'>, pos: number): { text: string; bar?: number; of?: number } {
  const run = s.run;
  if (!run || pos < 0) return { text: 'Get ready…' };
  const of = Math.ceil(run.beats / run.beatsPerBar - 1e-6), bar = Math.min(of, Math.floor(pos / run.beatsPerBar) + 1);
  return { text: `Bar ${bar} of ${of}`, bar, of };
}

/** Flow / beat-the-clock line: time left, bars played, and how much of the last 4 bars landed. */
export function flowMeter(s: TakeState, pos: number, now: number): string {
  const run = s.run, bpb = run?.beatsPerBar ?? 4;
  const mine = run ? run.notes.flatMap((_, i) => (s.auto[i] ? [] : [i])) : [];
  const pct = run && pos > bpb ? recentAccuracy(mine.map(i => s.results[i]), { ...run, notes: mine.map(i => run.notes[i]) }, Math.max(0, pos - 4 * bpb), pos - 0.5) : null;
  const left = s.options?.seconds ? Math.max(0, Math.ceil(s.options.seconds - (now - s.zero) / 1000)) : undefined;
  return `${left !== undefined ? `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left · ` : '🌊 '}${Math.max(0, Math.floor(pos / bpb))} bars${left === undefined ? ' in the flow' : ''}${pct !== null ? ` · last 4 bars: ${pct}% landed` : ''}`;
}
