// What Practice and Progress read from the iPad's storage (D3: the device is the source of truth): every run, the
// coach-written lessons next to the built-in ones (the web's allLessons), and the latest week plan. Never throws:
// a missing database reads as a fresh start.
import { CURRICULUM } from '@drum-coach/core/content/curriculum';
import type { Lesson } from '@drum-coach/core/engine/lesson';
import type { RunRow } from '@drum-coach/core/engine/progress';
import type { RunsRepo } from '../../data/runs';
import type { AppStorage } from '../../data/store';

export type StoredData = { runs: RunRow[]; lessons: Lesson[]; plan?: { week?: string; focus?: string } };

const isLesson = (l: unknown): l is Lesson => {
  const x = l as Partial<Lesson> | null;
  return !!x && typeof x.id === 'string' && typeof x.title === 'string' && typeof x.level === 'number' && Array.isArray(x.steps) && x.steps.length > 0;
};

/** Built-in lessons, then the coach's (a coach lesson never replaces a built-in one with the same id). */
export function allLessons(ai: unknown[]): Lesson[] {
  const ids = new Set(CURRICULUM.map(l => l.id));
  return [...CURRICULUM, ...ai.filter(isLesson).filter(l => !ids.has(l.id))];
}

export async function loadStoredData(storage: Pick<AppStorage, 'aiLessons' | 'plans'> & { runs: Pick<RunsRepo, 'list'> }): Promise<StoredData> {
  const [runs, ai, plan] = await Promise.all([
    storage.runs.list().catch(() => [] as RunRow[]),
    storage.aiLessons?.list().catch(() => []) ?? Promise.resolve([]),
    storage.plans?.latest().catch(() => null) ?? Promise.resolve(null),
  ]);
  const p = plan?.plan;
  return {
    runs, lessons: allLessons(ai),
    plan: p ? { week: typeof p.week === 'string' ? p.week : undefined, focus: typeof p.focus === 'string' ? p.focus : undefined } : undefined,
  };
}
