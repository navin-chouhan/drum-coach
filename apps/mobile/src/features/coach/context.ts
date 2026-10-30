// The coach `context` for one route, from the iPad's storage plus the coach's saved exercises (charts.ts), which
// storage's contextSource doesn't read yet.
import { buildCoachContext, type CoachContext, type CoachRoute, type ContextSource } from '../../data/coachContext';
import type { CoachCharts } from './charts';

/** What the context's catalog reads of a saved exercise (server/coachContext.ts ContextChartSchema). */
export const catalogEntry = (c: { id: string; title: string; kind?: string; level?: number; bpm: number; timeSignature?: unknown; description?: string }) => ({
  id: c.id, title: c.title, kind: c.kind, level: c.level, bpm: c.bpm, timeSignature: c.timeSignature, description: c.description,
});

export function createContextFor(storage: { contextSource(): Promise<ContextSource> }, charts?: Pick<CoachCharts, 'list'>) {
  return async (route: CoachRoute): Promise<CoachContext> => {
    const src = await storage.contextSource();
    const saved = charts?.list().map(catalogEntry);
    return buildCoachContext(saved?.length ? { ...src, charts: [...(src.charts ?? []), ...saved] } : src, route).context;
  };
}
