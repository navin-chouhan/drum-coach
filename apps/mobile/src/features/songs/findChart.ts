// One lookup for a chart id (QA m8), as the web's single /api/charts list plus its built-in LIBRARY: the iPad keeps
// imported songs in the `charts` table (data/songs.ts, with their backing audio) and the coach's exercises in the
// key-value store (features/coach/charts.ts). A drill, a plan item or Practice that names either finds it here.
import type { Chart } from '@drum-coach/core/engine/chart';
import { LIBRARY } from '@drum-coach/core/content/library';
import type { KeyValueStore } from '@drum-coach/core/platform';
import type { ChartsRepo } from '../../data/songs';
import { createCoachCharts, type CoachCharts } from '../coach/charts';

/** A chart wherever it lives; `hasAudio`/`audioFile`/`syncOffsetMs` only for imports (pass it to backingFor). */
export type FoundChart = Chart & { id: string; source: 'builtin' | 'import' | 'ai'; hasAudio?: boolean; audioFile?: string; syncOffsetMs?: number };

export type ChartSources = {
  /** storage.charts (null when the database didn't open). */
  charts?: Pick<ChartsRepo, 'get'> | null;
  coachCharts?: Pick<CoachCharts, 'byId'>;
};

/** Built-in first (the web's LIBRARY), then the `charts` table, then the coach's saved exercises. */
export function findChart(id: string, o: ChartSources): FoundChart | undefined {
  const builtIn = LIBRARY.find(c => c.id === id);
  if (builtIn) return { ...builtIn, source: 'builtin' };
  const stored = o.charts?.get(id);
  if (stored) return stored;
  const coach = o.coachCharts?.byId(id);
  if (!coach) return undefined;
  const { savedAt: _savedAt, ...chart } = coach;
  return chart;
}

/** findChart on the app's Storage (`getStorage()`): its charts table and the coach's charts in its key-value store. */
export function findStoredChart(id: string, storage: { charts: Pick<ChartsRepo, 'get'> | null; kv: KeyValueStore }): FoundChart | undefined {
  return findChart(id, { charts: storage.charts, coachCharts: createCoachCharts(storage.kv) });
}

/** findChart's yes/no (a suggestion's or drill's target that is a chart, not a lesson). */
export const chartExists = (id: string, o: ChartSources) => findChart(id, o) !== undefined;
