import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const DATA_DIR = process.env.DATA_DIR ?? join(import.meta.dirname, '..', 'data');
export const AUDIO_DIR = join(DATA_DIR, 'audio');
mkdirSync(AUDIO_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, 'drum-coach.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS charts (
    id TEXT PRIMARY KEY, json TEXT NOT NULL, source TEXT NOT NULL,
    audio_file TEXT, sync_offset_ms REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY, chart_id TEXT NOT NULL, chart_title TEXT NOT NULL, level INTEGER,
    started_at TEXT NOT NULL, duration_s REAL NOT NULL, bpm REAL NOT NULL, speed REAL NOT NULL,
    accuracy REAL NOT NULL, mean_offset REAL NOT NULL, spread REAL NOT NULL, summary_json TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS runs_started ON runs(started_at);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY, json TEXT NOT NULL, checks_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, kind TEXT NOT NULL, response TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
`);
