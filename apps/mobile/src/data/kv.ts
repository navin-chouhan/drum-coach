// The core's synchronous KeyValueStore on the `kv` table, with the web app's localStorage keys so settings, note maps
// and pad calibration port unchanged. Never throws: a failed write is kept in memory for this session (as the web
// does in private mode), and a missing database (no native module, or a schema error) makes it memory-only.
import type { KeyValueStore } from '@drum-coach/core/platform';
import type { SqlDb } from './sql';

/** The keys the web app uses (docs/mobile/RECON.md §5), plus the iPad's home-server URL. Never a secret. */
export const KV_KEYS = {
  settings: 'drumcoach.settings',
  noteMap: (kit: string) => `drumcoach.noteMap.${kit}`,
  padCal: (kit: string) => `drumcoach.padCal.${kit}`,
  midiInput: 'drumcoach.midiInput',
  playOptions: 'drumcoach.playOptions',
  /** The home server's base URL (src/platform/api.ts). Its token lives only in expo-secure-store. */
  homeServerUrl: 'drumcoach.homeServer.url',
} as const;

type Log = (message: string) => void;

export type Kv = KeyValueStore & {
  /** Every key with this prefix (e.g. 'drumcoach.noteMap.'), from the table and this session's writes. */
  keys(prefix: string): string[];
};

export function createKv(db: SqlDb | null, log: Log = m => console.warn(m)): Kv {
  // This session's writes (null = removed). Reads check it first, so a write that failed on disk still reads back.
  const written = new Map<string, string | null>();
  let warned = false;
  const fail = (what: string, e: unknown) => {
    if (warned) return; // one line, not one per keystroke; never the value
    warned = true;
    log(`kv: ${what} failed (${e instanceof Error ? e.message.split('\n')[0] : 'error'}); keeping changes in memory`);
  };
  return {
    get(key) {
      if (written.has(key)) return written.get(key) ?? null;
      if (!db) return null;
      try {
        return db.getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key])?.value ?? null;
      } catch (e) {
        fail('read', e);
        return null;
      }
    },
    set(key, value) {
      written.set(key, value);
      if (!db) return;
      try {
        db.runSync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [key, value]);
      } catch (e) {
        fail('write', e);
      }
    },
    remove(key) {
      written.set(key, null);
      if (!db) return;
      try {
        db.runSync('DELETE FROM kv WHERE key = ?', [key]);
      } catch (e) {
        fail('remove', e);
      }
    },
    keys(prefix) {
      const out = new Set<string>();
      if (db) {
        try {
          // substr, not LIKE: kit names may contain % or _
          for (const r of db.getAllSync<{ key: string }>('SELECT key FROM kv WHERE substr(key, 1, ?) = ?', [prefix.length, prefix])) out.add(r.key);
        } catch (e) {
          fail('read', e);
        }
      }
      for (const [k, v] of written) {
        if (!k.startsWith(prefix)) continue;
        if (v === null) out.delete(k);
        else out.add(k);
      }
      return [...out].sort();
    },
  };
}
