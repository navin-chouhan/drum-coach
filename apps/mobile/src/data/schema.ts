// The iPad's own database (D3: the device is the source of truth; no import, no sync). Tables and columns mirror
// server/db.ts so the row → API mappers port unchanged; `kv` is new and holds the web app's localStorage keys.
// Versioned with PRAGMA user_version: migration N takes the database from version N-1 to N. Never edit a shipped
// migration; add the next one.
import { SONGS_MIGRATION } from './songs';
import type { SqlDb } from './sql';

export const MIGRATIONS: readonly string[] = [
  // 1: the first schema. runs/run_hits/settings/plans/ai_lessons as in server/db.ts; kv for the core's KeyValueStore.
  `CREATE TABLE kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE runs (
    id INTEGER PRIMARY KEY, chart_id TEXT NOT NULL, chart_title TEXT NOT NULL, level INTEGER,
    started_at TEXT NOT NULL, duration_s REAL NOT NULL, bpm REAL NOT NULL, speed REAL NOT NULL,
    accuracy REAL NOT NULL, mean_offset REAL NOT NULL, spread REAL NOT NULL, summary_json TEXT NOT NULL);
  CREATE INDEX runs_started ON runs(started_at);
  CREATE TABLE run_hits (run_id INTEGER PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE plans (id INTEGER PRIMARY KEY, json TEXT NOT NULL, checks_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE ai_lessons (id TEXT PRIMARY KEY, json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));`,
  // 2: Songs (A8): server/db.ts's charts, yt_songs (with verified_at) and yt_grids, unchanged.
  SONGS_MIGRATION,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export class SchemaTooNewError extends Error {
  constructor(readonly found: number) {
    super(`The database is at schema version ${found}; this build knows up to ${SCHEMA_VERSION}. Update the app.`);
  }
}

/**
 * Opens the schema: WAL (outside the transaction, as SQLite requires), then every missing migration and the new
 * user_version in one transaction, so a failed migration leaves the old version intact. Synchronous: the key-value
 * store must be readable before the first screen renders. Returns the version it started from.
 */
export function migrate(db: SqlDb): { from: number; to: number } {
  db.execSync('PRAGMA journal_mode = WAL');
  const from = db.getFirstSync<{ user_version: number }>('PRAGMA user_version', [])?.user_version ?? 0;
  if (from > SCHEMA_VERSION) throw new SchemaTooNewError(from);
  if (from < SCHEMA_VERSION) {
    db.withTransactionSync(() => {
      for (let v = from; v < SCHEMA_VERSION; v++) db.execSync(MIGRATIONS[v]);
      db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION}`); // a constant, not input
    });
  }
  return { from, to: SCHEMA_VERSION };
}
