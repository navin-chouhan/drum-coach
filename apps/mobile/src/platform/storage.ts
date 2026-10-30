// Storage (contracts.ts) on expo-sqlite: one database file in the app's documents directory, opened synchronously at
// first use so the key-value store can be read before the first screen renders. All logic is in src/data/ (tested
// in Node); this file only opens the native database.
import { openDatabaseSync } from 'expo-sqlite';
import { createDataStore, type AppStorage } from '../data/store';

export const DATABASE_NAME = 'drumcoach.db';

let instance: AppStorage | null = null;

/** The app's storage. If the native module or the database fails, settings live in memory and openError says why. */
export function getStorage(): AppStorage {
  instance ??= createDataStore(() => openDatabaseSync(DATABASE_NAME));
  return instance;
}

export type { AppStorage } from '../data/store';
export { KV_KEYS } from '../data/kv';
