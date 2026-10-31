// The exercises the coach wrote (a drill's or a suggestion's new chart), saved on the iPad as the web saves them: in
// the `charts` table with source 'ai' (the web's POST /api/charts, src/content/charts.ts saveChart; QA m8), next to
// imported songs, so one lookup (features/songs findStoredChart) finds both and the coach context reads them from
// storage (data/store.ts contextSource). The old key-value list moves into the table once (data/songs.ts
// migrateCoachCharts). This is a thin wrapper over the table for the coach and Practice.
import { ChartSchema, type Chart } from '@drum-coach/core/engine/chart';
import { LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import { LIBRARY } from '@drum-coach/core/content/library';
import { KV_KEYS } from '../../data/kv';
import type { ChartsRepo, StoredChart } from '../../data/songs';

/** The legacy key-value list (moved into the table on start). */
export const COACH_CHARTS_KEY = KV_KEYS.coachCharts;

export type CoachChart = StoredChart & { source: 'ai' };

/** The server's id rule (server/index.ts POST /api/charts): a slug of the title and 5 random characters. */
export function chartIdFor(title: string, random: () => number = Math.random): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'chart';
  return `${slug}-${random().toString(36).slice(2, 7).padEnd(5, '0')}`;
}

/** Objects with their keys sorted (at every depth), so key order never makes two equal charts differ. */
const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted((v as Record<string, unknown>)[k])])) : v;

/** A chart's content without its id or where it's stored, so the same exercise compares equal. */
const contentKey = (c: unknown) => {
  const p = ChartSchema.safeParse(c);
  return p.success ? JSON.stringify(sorted({ ...p.data, id: undefined, kind: p.data.kind ?? 'exercise' })) : null;
};

const isAi = (c: StoredChart): c is CoachChart => c.source === 'ai';

/**
 * The coach's exercises in `storage.charts`. When the database didn't open (`charts` null) they're kept in memory for
 * this session, as the key-value store then is.
 */
export function createCoachCharts(storage: { charts: Pick<ChartsRepo, 'list' | 'get' | 'save'> | null }, o: { random?: () => number } = {}) {
  const memory: CoachChart[] = [];
  const all = (): StoredChart[] => storage.charts?.list() ?? memory;
  const list = (): CoachChart[] => all().filter(isAi).reverse();
  return {
    /** The coach's exercises, newest first. */
    list,
    /** Any saved chart (the coach's or an import), as the web's chartExists looks at every stored chart. */
    byId: (id: string): StoredChart | undefined => (storage.charts ? storage.charts.get(id) : memory.find(c => c.id === id)) ?? undefined,
    /** Saves a chart the coach wrote; the same exercise again keeps the one already saved. */
    save(chart: Chart): CoachChart {
      const key = contentKey(chart);
      const old = key ? list().find(c => contentKey(c) === key) : undefined;
      if (old) return old;
      if (storage.charts) return storage.charts.save(chart, 'ai') as CoachChart;
      const saved: CoachChart = { ...chart, kind: chart.kind ?? 'exercise', id: chartIdFor(chart.title, o.random), source: 'ai', hasAudio: false, syncOffsetMs: 0 };
      memory.push(saved);
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
