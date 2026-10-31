// Storage on the web: the layout harness only (scripts/screenshots.mjs; the app is iPad-only). In memory, seeded with
// fake data for the state in the URL (src/dev/harness/seeds.ts). Metro picks this file for `--platform web` only.
import type { RunRow } from '@drum-coach/core/engine/progress';
import { createDataStore, type AppStorage } from '../data/store';
import type { AiLesson, AiLessonsRepo, PlansRepo } from '../data/records';
import type { RunsRepo } from '../data/runs';
import { harnessState, seedFor } from '../dev/harness/seeds';
import { KV_KEYS } from '../data/kv';

export const DATABASE_NAME = 'drumcoach.db';

let instance: AppStorage | null = null;

export function getStorage(): AppStorage {
  if (instance) return instance;
  const seed = seedFor(harnessState());
  const base = createDataStore(() => { throw new Error('web harness: in memory'); }, () => {});
  base.kv.set(KV_KEYS.settings, JSON.stringify(seed.settings));
  const runs: RunRow[] = [...seed.runs];
  const runsRepo: RunsRepo = {
    add: async () => String(runs.length),
    list: async () => runs,
    take: async () => null,
    recent: async n => runs.slice(-n).reverse() as never,
  };
  let ai = [...seed.ai] as AiLesson[];
  const aiLessons: AiLessonsRepo = {
    list: async () => ai, put: l => { ai = [...ai.filter(x => x.id !== l.id), l]; }, remove: id => { const n = ai.length; ai = ai.filter(x => x.id !== id); return ai.length < n; },
    replace: (l, ids) => { ai = [...ai.filter(x => x.id !== l.id && !ids.includes(x.id)), l]; },
  };
  const plans: PlansRepo = { latest: async () => (seed.plan ? { id: 1, plan: seed.plan, checks: {} } as never : null), add: () => 1, setChecks: () => true };
  instance = { ...base, runs: runsRepo, aiLessons, plans };
  return instance;
}

export type { AppStorage } from '../data/store';
export { KV_KEYS } from '../data/kv';
