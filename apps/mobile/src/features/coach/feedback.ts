// The coach's feedback after a take, with a drill (ported from src/coach/CoachFeedback.tsx): asked on request
// ("Detailed feedback and a drill"), once per take, spoken once when the voice is on.
import type { Feedback } from '@drum-coach/core/coach/schemas';
import type { Chart } from '@drum-coach/core/engine/chart';
import type { CoachAsks, Entry } from './asks';
import type { RunSummary } from './summary';

export const feedbackKey = (startedAt: string) => `feedback:${startedAt}`;

/** Asks for this take's feedback (POST /api/coach/feedback with the summary and the iPad's context). */
export const askFeedback = (asks: CoachAsks, startedAt: string, summary: RunSummary, again = false) =>
  asks.ask<Feedback>(feedbackKey(startedAt), 'feedback', { summary }, undefined, again);

/** The line the coach says out loud: its `spoken` lines, else the feedback's first sentence (as the web). */
export const spokenLine = (f: Feedback) => f.spoken ?? f.feedback.split(/(?<=[.!?])\s/)[0];

/** Says the coach's main point once per answer (when "speak" is on). */
export function createSpeakOnce(say: (text: string) => void, voiceOn: () => boolean) {
  const spoken = new Set<string>();
  return (key: string, f: Feedback) => {
    if (spoken.has(key) || !voiceOn()) return;
    spoken.add(key);
    say(spokenLine(f));
  };
}

/** What "Play this drill" opens: a new chart the coach wrote, or one that exists. None: no button. */
export type DrillTarget = { chart: Chart; bpm?: number } | { chartId: string; bpm?: number };
export function drillTarget(d: Feedback['drill'], exists: (chartId: string) => boolean): DrillTarget | undefined {
  if (d.chart) return { chart: d.chart, bpm: d.bpm };
  if (d.chartId && exists(d.chartId)) return { chartId: d.chartId, bpm: d.bpm };
  return undefined;
}

/** The drill card's kicker, e.g. "Drill · 65 BPM" (mockup coach). */
export const drillKicker = (d: Feedback['drill']) => (d.bpm ? `Drill · ${Math.round(d.bpm)} BPM` : 'Drill');

/** What the feedback card shows for an entry. */
export type FeedbackView =
  | { state: 'ask' }
  | { state: 'thinking' }
  | { state: 'error'; error: string; offline: boolean }
  | { state: 'done'; feedback: string; drill: Feedback['drill']; kicker: string; target?: DrillTarget; cached: boolean };

export function feedbackView(e: Entry<Feedback> | undefined, exists: (chartId: string) => boolean): FeedbackView {
  if (!e) return { state: 'ask' };
  if (e.status === 'thinking') return { state: 'thinking' };
  if (e.status === 'error' || !e.data) return { state: 'error', error: e.error ?? 'The coach couldn’t answer', offline: e.problem?.canQueue ?? false };
  const d = e.data;
  return { state: 'done', feedback: d.feedback, drill: d.drill, kicker: drillKicker(d.drill), target: drillTarget(d.drill, exists), cached: !!e.cached };
}
