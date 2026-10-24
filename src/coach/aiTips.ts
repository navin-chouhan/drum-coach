import type { Chart } from '../engine/chart';
import type { Cue } from '../engine/liveCoach';
import { getSettings } from '../input/settings';
import { prepare } from '../voice/voice';
import { askCoach } from './api';

// The coach writes the wording of the live tips once per exercise; the rule engine still decides when they fire.
type Tip = { text: string; spoken: string };
const tips = new Map<string, Record<string, Tip>>();
const BASE = ['rushing', 'dragging', 'unsteady', 'extras', 'hh-open', 'accents', 'ghosts', 'even', 'praise'];

export const chartKey = (c: Chart & { id?: string }) => c.id ?? c.title;

/** Asks for this exercise's tip wording (once; the server caches it) and pre-renders the spoken lines. */
export function loadTips(chart: Chart & { id?: string }, goal?: string) {
  const s = getSettings(), key = chartKey(chart);
  if (!s.aiTips || s.liveTips === 'off' || tips.has(key)) return;
  const cueIds = [...BASE, ...new Set(chart.notes.map(n => `missing-${n.drum}`))];
  askCoach<{ tips: Record<string, Tip> }>(`tips:${key}`, 'tips', { title: chart.title, kind: chart.kind, level: chart.level, goal, cueIds }, d => {
    tips.set(key, d.tips);
    void prepare(Object.values(d.tips).map(t => t.spoken.replace('{ms}', '').trim()));
  });
}

/** The coach's wording for a cue, when it has written one ("{ms}" filled in from the rule's measurement). */
export function applyTip(chart: (Chart & { id?: string }) | undefined, cue: Cue): Cue {
  const t = chart && tips.get(chartKey(chart))?.[cue.id];
  if (!t) return cue;
  const ms = cue.text.match(/(\d+) ms/)?.[1];
  const fill = (s: string) => (ms ? s.replace('{ms}', ms) : s.replace(/\s*\{ms\}\s*(ms)?/, ' ')).replace(/\s+/g, ' ').trim();
  return { ...cue, text: fill(t.text), spoken: fill(t.spoken).replace(/\d+\s*ms/, '').trim() || cue.spoken };
}
