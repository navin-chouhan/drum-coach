// The coach `context` for one route, from the iPad's storage. The coach's saved exercises are in the `charts` table
// (QA m8), which storage's contextSource reads (the server's savedAiCharts), so nothing is added here.
import { buildCoachContext, type CoachContext, type CoachRoute, type ContextSource } from '../../data/coachContext';

export function createContextFor(storage: { contextSource(): Promise<ContextSource> }) {
  return async (route: CoachRoute): Promise<CoachContext> => buildCoachContext(await storage.contextSource(), route).context;
}
