// The Storage contract (src/platform/contracts.ts) over one SqlDb: migrations, the key-value store and the repos,
// plus the coach context read from them. src/platform/storage.ts gives it expo-sqlite's database; tests give it
// node:sqlite.
import type { Storage } from '../platform/contracts';
import { buildCoachContext, type BuiltContext, type CoachRoute, type ContextSource } from './coachContext';
import { createKv, KV_KEYS, type Kv } from './kv';
import { createAiLessonsRepo, createPlansRepo, createSettingsRepo, type AiLessonsRepo, type PlansRepo, type SettingsRepo } from './records';
import { createRunsRepo, type RunsRepo } from './runs';
import { migrate } from './schema';
import { createChartsRepo, createSongsRepo, type ChartsRepo, type SongsRepo } from './songs';
import type { SqlDb } from './sql';

export type AppStorage = Storage & {
  readonly kv: Kv;
  readonly runs: RunsRepo;
  /** Null when the database couldn't be opened: the key-value store then works in memory only and repos are absent. */
  readonly settings: SettingsRepo | null;
  readonly plans: PlansRepo | null;
  readonly aiLessons: AiLessonsRepo | null;
  /** YouTube songs and their beat grids (the web's /api/ytsongs, /api/ytgrids). */
  readonly songs: SongsRepo | null;
  /** Imported songs and coach exercises (the web's /api/charts). */
  readonly charts: ChartsRepo | null;
  /** Why the database isn't there (shown on the debug screen), or null. */
  readonly openError: string | null;
  /** Everything the coach context can carry, read from storage. */
  contextSource(): Promise<ContextSource>;
  /** The `context` for one coach route, ≤ 50 KB. */
  coachContext(route: CoachRoute): Promise<BuiltContext>;
};

class StorageUnavailableError extends Error {}

/** `open` returns the database (or throws); any failure there or in migrating leaves a memory-only key-value store. */
export function createDataStore(open: () => SqlDb, log: (m: string) => void = m => console.warn(m)): AppStorage {
  let db: SqlDb | null = null;
  let openError: string | null = null;
  try {
    const d = open();
    migrate(d);
    db = d;
  } catch (e) {
    openError = e instanceof Error ? e.message.split('\n')[0] : 'could not open the database';
    log(`storage: ${openError}; settings are kept in memory until the app restarts`);
  }
  const kv = createKv(db, log);
  const unavailable = () => Promise.reject(new StorageUnavailableError(`storage unavailable: ${openError}`));
  const runs: RunsRepo = db ? createRunsRepo(db) : { add: unavailable, list: async () => [], take: async () => null, recent: async () => [] };
  const settings = db ? createSettingsRepo(db, kv) : null;
  const plans = db ? createPlansRepo(db) : null;
  const aiLessons = db ? createAiLessonsRepo(db) : null;
  const songs = db ? createSongsRepo(db) : null;
  const charts = db ? createChartsRepo(db) : null;

  const parse = (text: string | null) => { try { return text == null ? undefined : JSON.parse(text) as unknown; } catch { return undefined; } };
  async function contextSource(): Promise<ContextSource> {
    return {
      runs: await runs.recent(1000),
      appSettings: parse(kv.get(KV_KEYS.settings)),
      plan: (await plans?.latest())?.plan,
      teacherNotes: settings?.get('teacherNotes'),
      aiLessons: (await aiLessons?.list()) ?? [],
      monthReport: settings?.get('monthReport'),
      songs: songs?.list() ?? [],
      // the server's savedAiCharts: coach exercises only, as { ...chart, id }, newest first
      charts: (charts?.list() ?? []).filter(c => c.source === 'ai').reverse()
        .map(({ source: _s, hasAudio: _a, syncOffsetMs: _o, audioFile: _f, ...c }) => c),
    };
  }
  return {
    kv, runs, settings, plans, aiLessons, songs, charts, openError, contextSource,
    coachContext: async route => buildCoachContext(await contextSource(), route),
  };
}
