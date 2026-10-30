// /lesson/chart?chartId=…&bpm=… ("Play this drill", plan items): one chart from core LIBRARY or the coach's saved
// charts, played in the lesson player as a one-take item. It saves its run like any take but writes no lesson
// progress (the web plays drills in its practice player, which has no ladder either).
import type { Chart } from '@drum-coach/core/engine/chart';
import type { Lesson } from '@drum-coach/core/engine/lesson';
import { LIBRARY } from '@drum-coach/core/content/library';

export const DRILL_PREFIX = 'chart/';

export function findDrillChart(chartId: string, coachChart: (id: string) => (Chart & { id: string }) | undefined): (Chart & { id: string }) | undefined {
  return LIBRARY.find(c => c.id === chartId) ?? coachChart(chartId);
}

/** The drill as a one-step lesson at `bpm` (default: the chart's own tempo). */
export function drillLesson(chart: Chart & { id: string }, bpm?: number): Lesson {
  const at = Math.round(bpm && bpm >= 30 && bpm <= 300 ? bpm : chart.bpm);
  return {
    id: `${DRILL_PREFIX}${chart.id}`, level: chart.level ?? 2, kind: chart.kind ?? 'exercise', title: chart.title,
    what: 'A drill from your coach.', why: 'One thing to work on, picked from your takes.', how: 'Play it through once with the click. Hear it first if you like.',
    steps: [{ title: chart.title, text: `Play ${chart.title} at ${at} BPM.`, chart, bpm: { start: at, target: at } }],
  };
}

export const parseBpm = (v: string | string[] | undefined) => { const n = Number(Array.isArray(v) ? v[0] : v); return Number.isFinite(n) && n > 0 ? n : undefined; };
