// The part of expo-sqlite's SQLiteDatabase (58.0.13) that the data layer uses. expo-sqlite's database satisfies it
// as is (src/platform/storage.ts); the tests pass Node's built-in node:sqlite through the same shape, so the real
// SQL (schema, migrations, json_extract, the take cap) runs in Vitest.

export type SqlValue = string | number | null;
export type SqlRunResult = { lastInsertRowId: number; changes: number };

export interface SqlDb {
  /** Trusted, static SQL only (no bound values), one or more statements. */
  execSync(source: string): void;
  runSync(source: string, params: SqlValue[]): SqlRunResult;
  getFirstSync<T>(source: string, params: SqlValue[]): T | null;
  getAllSync<T>(source: string, params: SqlValue[]): T[];
  /** Commits when `task` returns, rolls back when it throws. */
  withTransactionSync(task: () => void): void;
  getFirstAsync<T>(source: string, params: SqlValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: SqlValue[]): Promise<T[]>;
}
