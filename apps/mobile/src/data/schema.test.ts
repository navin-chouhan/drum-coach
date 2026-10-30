import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { migrate, SCHEMA_VERSION, SchemaTooNewError } from './schema';
import { openTestDb, type TestDb } from './nodeSqlite.testutil';

const tables = (db: TestDb) =>
  db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name", []).map(r => r.name);
const columns = (db: TestDb, table: string) =>
  db.getAllSync<{ name: string; type: string; notnull: number; pk: number }>(`PRAGMA table_info(${table})`, []);

describe('migrate', () => {
  const open: TestDb[] = [];
  afterEach(() => open.splice(0).forEach(d => d.close()));
  const fresh = () => { const d = openTestDb(); open.push(d); return d; };

  it('creates every table on a fresh database and sets user_version', () => {
    const db = fresh();
    expect(migrate(db)).toEqual({ from: 0, to: SCHEMA_VERSION });
    expect(tables(db)).toEqual(['ai_lessons', 'charts', 'kv', 'plans', 'run_hits', 'runs', 'settings', 'yt_grids', 'yt_songs']);
    expect(db.getFirstSync<{ user_version: number }>('PRAGMA user_version', [])?.user_version).toBe(SCHEMA_VERSION);
  });

  it('mirrors server/db.ts columns for runs, plans and ai_lessons', () => {
    const db = fresh();
    migrate(db);
    expect(columns(db, 'runs').map(c => c.name)).toEqual([
      'id', 'chart_id', 'chart_title', 'level', 'started_at', 'duration_s', 'bpm', 'speed', 'accuracy', 'mean_offset', 'spread', 'summary_json',
    ]);
    expect(columns(db, 'run_hits').map(c => c.name)).toEqual(['run_id', 'json']);
    expect(columns(db, 'settings').map(c => c.name)).toEqual(['key', 'value']);
    expect(columns(db, 'plans').map(c => c.name)).toEqual(['id', 'json', 'checks_json', 'created_at']);
    expect(columns(db, 'ai_lessons').map(c => c.name)).toEqual(['id', 'json', 'created_at']);
    expect(db.getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'runs_started'", [])).toHaveLength(1);
  });

  it('mirrors server/db.ts columns for charts, yt_songs and yt_grids (migration 2, Songs)', () => {
    const db = fresh();
    migrate(db);
    expect(columns(db, 'charts').map(c => c.name)).toEqual(['id', 'json', 'source', 'audio_file', 'sync_offset_ms', 'created_at']);
    expect(columns(db, 'yt_songs').map(c => c.name)).toEqual([
      'id', 'title', 'original_id', 'drumless_id', 'cover_id', 'ts_num', 'ts_den', 'notes_json', 'created_at', 'verified_at',
    ]);
    expect(columns(db, 'yt_grids').map(c => c.name)).toEqual(['video_id', 'bpm', 'offset_sec']);
  });

  it('is a no-op the second time and keeps rows', () => {
    const db = fresh();
    migrate(db);
    db.runSync('INSERT INTO kv (key, value) VALUES (?, ?)', ['a', '1']);
    expect(migrate(db)).toEqual({ from: SCHEMA_VERSION, to: SCHEMA_VERSION });
    expect(db.getFirstSync<{ value: string }>('SELECT value FROM kv WHERE key = ?', ['a'])?.value).toBe('1');
  });

  it('refuses a database from a newer build and leaves it alone', () => {
    const db = fresh();
    db.execSync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    expect(() => migrate(db)).toThrow(SchemaTooNewError);
    expect(tables(db)).toEqual([]);
  });

  it('rolls back a failed migration: no tables, version unchanged', () => {
    const db = fresh();
    db.execSync('CREATE TABLE runs (x)'); // makes migration 1 fail half way
    expect(() => migrate(db)).toThrow();
    expect(tables(db)).toEqual(['runs']);
    expect(db.getFirstSync<{ user_version: number }>('PRAGMA user_version', [])?.user_version).toBe(0);
  });

  it('turns on WAL for a database file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dc-wal-'));
    try {
      const db = openTestDb(join(dir, 'drumcoach.db'));
      migrate(db);
      expect(db.getFirstSync<{ journal_mode: string }>('PRAGMA journal_mode', [])?.journal_mode).toBe('wal');
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
