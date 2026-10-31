// One lookup for a chart id (QA m8), as the web's single /api/charts list plus its built-in LIBRARY: the iPad keeps
// imported songs (data/songs.ts, with their backing audio) and the coach's exercises (source 'ai',
// features/coach/charts.ts) in the one `charts` table. A drill, a plan item or Practice that names either finds it here.
import type { Chart } from '@drum-coach/core/engine/chart';
import { LIBRARY } from '@drum-coach/core/content/library';
import type { ChartsRepo } from '../../data/songs';

/** A chart wherever it lives; `hasAudio`/`audioFile`/`syncOffsetMs` only for stored charts (pass it to backingFor). */
export type FoundChart = Chart & { id: string; source: 'builtin' | 'import' | 'ai'; hasAudio?: boolean; audioFile?: string; syncOffsetMs?: number };

export type ChartSources = {
  /** storage.charts (null when the database didn't open). */
  charts?: Pick<ChartsRepo, 'get'> | null;
};

/** Built-in first (the web's LIBRARY), then the `charts` table (imports and the coach's exercises). */
export function findChart(id: string, o: ChartSources): FoundChart | undefined {
  const builtIn = LIBRARY.find(c => c.id === id);
  if (builtIn) return { ...builtIn, source: 'builtin' };
  return o.charts?.get(id) ?? undefined;
}

/** findChart on the app's Storage (`getStorage()`): the library, then its charts table. */
export function findStoredChart(id: string, storage: { charts: Pick<ChartsRepo, 'get'> | null }): FoundChart | undefined {
  return findChart(id, { charts: storage.charts });
}

/** findChart's yes/no (a suggestion's or drill's target that is a chart, not a lesson). */
export const chartExists = (id: string, o: ChartSources) => findChart(id, o) !== undefined;
