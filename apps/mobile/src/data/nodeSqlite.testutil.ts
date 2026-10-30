// Test helper: Node's built-in SQLite (node:sqlite) behind the SqlDb shape, so the data layer's real SQL runs in
// Vitest. Not imported by the app.
import { DatabaseSync } from 'node:sqlite';
import type { SqlDb, SqlValue } from './sql';

export type TestDb = SqlDb & { raw: DatabaseSync; close(): void };

const plain = <T>(row: unknown): T => ({ ...(row as object) }) as T; // node:sqlite rows have a null prototype

export function openTestDb(path = ':memory:'): TestDb {
  const raw = new DatabaseSync(path);
  const db: TestDb = {
    raw,
    close: () => raw.close(),
    execSync: source => raw.exec(source),
    runSync(source, params: SqlValue[]) {
      const r = raw.prepare(source).run(...params);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getFirstSync<T>(source: string, params: SqlValue[]) {
      const row = raw.prepare(source).get(...params);
      return row === undefined ? null : plain<T>(row);
    },
    getAllSync<T>(source: string, params: SqlValue[]) {
      return raw.prepare(source).all(...params).map(r => plain<T>(r));
    },
    withTransactionSync(task) {
      raw.exec('BEGIN');
      try {
        task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    getFirstAsync: async (source, params) => db.getFirstSync(source, params),
    getAllAsync: async (source, params) => db.getAllSync(source, params),
  };
  return db;
}
