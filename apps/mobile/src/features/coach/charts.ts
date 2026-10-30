// The exercises the coach wrote (a drill's or a suggestion's new chart), saved on the iPad. The web keeps them on its
// server (POST /api/charts with source 'ai', src/content/charts.ts saveChart); the iPad keeps them in its key-value
// store, newest first, so "Play this drill" can open them by id and the coach context can list them as the catalog
// (`charts`, at most 200, as server/coachContext.ts accepts).
import { ChartSchema, type Chart } from '@drum-coach/core/engine/chart';
import { LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import { LIBRARY } from '@drum-coach/core/content/library';
import type { KeyValueStore } from '@drum-coach/core/platform';

export const COACH_CHARTS_KEY = 'drumcoach.coachCharts';
export const MAX_COACH_CHARTS = 200;

export type CoachChart = Chart & { id: string; source: 'ai'; savedAt: string };

/** The server's id rule (server/index.ts POST /api/charts): a slug of the title and 5 random characters. */
export function chartIdFor(title: string, random: () => number = Math.random): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'chart';
  return `${slug}-${random().toString(36).slice(2, 7).padEnd(5, '0')}`;
}

const same = (a: Chart, b: Chart) => JSON.stringify({ ...a, id: undefined }) === JSON.stringify({ ...b, id: undefined });

export function createCoachCharts(kv: KeyValueStore, o: { random?: () => number; now?: () => Date } = {}) {
  const read = (): CoachChart[] => {
    try {
      const v: unknown = JSON.parse(kv.get(COACH_CHARTS_KEY) ?? '[]');
      if (!Array.isArray(v)) return [];
      return v.flatMap(x => {
        const p = ChartSchema.safeParse(x);
        const id = (x as { id?: unknown })?.id, savedAt = (x as { savedAt?: unknown })?.savedAt;
        return p.success && typeof id === 'string' ? [{ ...p.data, id, source: 'ai' as const, savedAt: typeof savedAt === 'string' ? savedAt : '' }] : [];
      });
    } catch { return []; }
  };
  return {
    /** Newest first. */
    list: read,
    byId: (id: string) => read().find(c => c.id === id),
    /** Saves a chart the coach wrote; the same chart again keeps its id (and moves to the front). */
    save(chart: Chart): CoachChart {
      const all = read();
      const old = all.find(c => same(c, chart));
      const kind = chart.kind ?? 'exercise';
      const saved: CoachChart = old ?? { ...chart, kind, id: chartIdFor(chart.title, o.random), source: 'ai', savedAt: (o.now?.() ?? new Date()).toISOString() };
      const next = [saved, ...all.filter(c => c.id !== saved.id)].slice(0, MAX_COACH_CHARTS);
      kv.set(COACH_CHARTS_KEY, JSON.stringify(next));
      return saved;
    },
  };
}
export type CoachCharts = ReturnType<typeof createCoachCharts>;

/**
 * A suggestion's target exists (src/coach/session.ts targetExists): a lesson ("lesson/<id>", built in or written by
 * the coach) or a chart in the library or saved.
 */
export function targetExists(chartId: string, o: { coachCharts?: Pick<CoachCharts, 'byId'>; aiLessonIds?: ReadonlySet<string> } = {}): boolean {
  if (chartId.startsWith('lesson/')) { const id = chartId.slice(7); return !!LESSON_BY_ID[id] || !!o.aiLessonIds?.has(id); }
  return LIBRARY.some(c => c.id === chartId) || !!o.coachCharts?.byId(chartId);
}
