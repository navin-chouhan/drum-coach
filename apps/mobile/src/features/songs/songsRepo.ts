// Songs on the iPad (D3: the device is the source of truth): YouTube songs, their beat grids and imported charts, in
// the server's tables and shapes (server/db.ts, server/index.ts: /api/ytsongs, /api/ytgrids, /api/charts), so the
// screens port from the web's api.ts and charts.ts unchanged.
//
// The tables arrive with schema migration 2 (SONGS_MIGRATION below), which the orchestrator adds to
// src/data/schema.ts MIGRATIONS (A8 may not edit src/data). Until then `songsTablesReady` is false and the screens
// say so.
import { ChartSchema, type Chart } from '@drum-coach/core/engine/chart';
import { GridSchema, YtSongCreateSchema, YtSongPatchSchema, type Grid, type YtSong } from '@drum-coach/core/youtube/schemas';
import type { SqlDb } from '../../data/sql';

/** Migration 2 for src/data/schema.ts: server/db.ts's charts, yt_songs (with verified_at) and yt_grids, unchanged. */
export const SONGS_MIGRATION = `CREATE TABLE charts (
    id TEXT PRIMARY KEY, json TEXT NOT NULL, source TEXT NOT NULL,
    audio_file TEXT, sync_offset_ms REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE yt_songs (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, original_id TEXT NOT NULL, drumless_id TEXT, cover_id TEXT,
    ts_num INTEGER NOT NULL DEFAULT 4, ts_den INTEGER NOT NULL DEFAULT 4, notes_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), verified_at TEXT);
  CREATE TABLE yt_grids (video_id TEXT PRIMARY KEY, bpm REAL NOT NULL, offset_sec REAL NOT NULL);`;

/** Are the songs tables there (migration 2 applied)? */
export const songsTablesReady = (db: SqlDb) =>
  (db.getFirstSync<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('charts', 'yt_songs', 'yt_grids')", [])?.n ?? 0) === 3;

export class SongInputError extends Error {}
const check = <T>(r: { success: true; data: T } | { success: false; error: { message: string } }): T => {
  if (!r.success) throw new SongInputError(r.error.message);
  return r.data;
};

type YtRow = { id: string; title: string; original_id: string; drumless_id: string | null; cover_id: string | null; ts_num: number; ts_den: number; notes_json: string; verified_at: string | null };
const parseNotes = (text: string): YtSong['notes'] => { try { const n = JSON.parse(text); return Array.isArray(n) ? n : []; } catch { return []; } };

export type SongsRepo = {
  /** GET /api/ytsongs: newest first. */
  list(): YtSong[];
  get(id: string): YtSong | null;
  /** POST /api/ytsongs: id `yt-<originalId>`; adding the same video again returns the song already there. */
  add(input: { title: string; originalId: string; drumlessId?: string | null; coverId?: string | null }): YtSong;
  /** PATCH /api/ytsongs/:id. Null when there is no such song. Changed notes clear "checked by ear" (N4). */
  patch(id: string, patch: unknown, today?: () => string): YtSong | null;
  /** DELETE /api/ytsongs/:id (the grids stay: they belong to the video, as on the server). */
  remove(id: string): void;
  /** PUT /api/ytgrids/:videoId. */
  saveGrid(videoId: string, grid: Grid): void;
};

export function createSongsRepo(db: SqlDb): SongsRepo {
  const grids = (ids: string[]): Record<string, Grid> => Object.fromEntries(
    db.getAllSync<{ video_id: string; bpm: number; offset_sec: number }>(`SELECT * FROM yt_grids WHERE video_id IN (${ids.map(() => '?').join(',')})`, ids)
      .map(g => [g.video_id, { bpm: g.bpm, offsetSec: g.offset_sec }]));
  const song = (r: YtRow): YtSong => ({
    id: r.id, title: r.title, originalId: r.original_id, drumlessId: r.drumless_id, coverId: r.cover_id,
    timeSignature: [r.ts_num, r.ts_den as 4], notes: parseNotes(r.notes_json),
    grids: grids([r.original_id, r.drumless_id, r.cover_id].filter((x): x is string => !!x)), verifiedAt: r.verified_at ?? null,
  });
  const row = (id: string) => db.getFirstSync<YtRow>('SELECT * FROM yt_songs WHERE id = ?', [id]);
  return {
    list: () => db.getAllSync<YtRow>('SELECT * FROM yt_songs ORDER BY created_at DESC, rowid DESC', []).map(song),
    get: id => { const r = row(id); return r ? song(r) : null; },
    add(input) {
      const b = check(YtSongCreateSchema.safeParse(input));
      const id = `yt-${b.originalId}`;
      db.runSync('INSERT OR IGNORE INTO yt_songs (id, title, original_id, drumless_id, cover_id) VALUES (?, ?, ?, ?, ?)',
        [id, b.title, b.originalId, b.drumlessId ?? null, b.coverId ?? null]);
      return song(row(id)!);
    },
    patch(id, patch, today = () => new Date().toISOString().slice(0, 10)) {
      const d = check(YtSongPatchSchema.safeParse(patch));
      const r = row(id);
      if (!r) return null;
      const notes = d.notes ? JSON.stringify(d.notes) : r.notes_json;
      // N4: "checked by ear" is set by the student; changed notes need checking again
      const verified = d.verified === true ? today() : d.verified === false || (d.notes && notes !== r.notes_json) ? null : r.verified_at;
      db.runSync('UPDATE yt_songs SET title = ?, drumless_id = ?, cover_id = ?, ts_num = ?, ts_den = ?, notes_json = ?, verified_at = ? WHERE id = ?', [
        d.title ?? r.title, d.drumlessId === undefined ? r.drumless_id : d.drumlessId, d.coverId === undefined ? r.cover_id : d.coverId,
        d.timeSignature?.[0] ?? r.ts_num, d.timeSignature?.[1] ?? r.ts_den, notes, verified, id]);
      return song(row(id)!);
    },
    remove: id => { db.runSync('DELETE FROM yt_songs WHERE id = ?', [id]); },
    saveGrid(videoId, grid) {
      if (!/^[\w-]{11}$/.test(videoId)) throw new SongInputError('Invalid grid');
      const g = check(GridSchema.safeParse(grid));
      db.runSync('INSERT OR REPLACE INTO yt_grids (video_id, bpm, offset_sec) VALUES (?, ?, ?)', [videoId, g.bpm, g.offsetSec]);
    },
  };
}

/** The web's StoredChart (src/content/charts.ts): `audioFile` is the iPad's own copy of the backing audio, if any. */
export type StoredChart = Chart & { id: string; source: 'import' | 'ai'; hasAudio: boolean; syncOffsetMs: number; audioFile?: string };
type ChartRow = { id: string; json: string; source: string; audio_file: string | null; sync_offset_ms: number };

export type ChartsRepo = {
  /** GET /api/charts: oldest first. */
  list(): StoredChart[];
  get(id: string): StoredChart | null;
  /** POST /api/charts: id = title slug + 5 random characters; `kind` defaults to song for an import. */
  save(chart: unknown, source: 'import' | 'ai'): StoredChart;
  /** PATCH /api/charts/:id (Song sync). False when there's none. */
  setSyncOffset(id: string, ms: number): boolean;
  /** Records the backing audio's local file (the platform copies it). */
  setAudio(id: string, file: string | null): boolean;
  /** DELETE /api/charts/:id. Returns the audio file the caller must delete, or null. */
  remove(id: string): { audioFile: string | null } | null;
};

export function createChartsRepo(db: SqlDb, random: () => number = Math.random): ChartsRepo {
  const out = (r: ChartRow): StoredChart => ({
    ...(JSON.parse(r.json) as Chart), id: r.id, source: r.source === 'ai' ? 'ai' : 'import', hasAudio: !!r.audio_file, syncOffsetMs: r.sync_offset_ms,
    ...(r.audio_file && { audioFile: r.audio_file }),
  });
  const row = (id: string) => db.getFirstSync<ChartRow>('SELECT * FROM charts WHERE id = ?', [id]);
  return {
    list: () => db.getAllSync<ChartRow>('SELECT * FROM charts ORDER BY created_at, rowid', []).map(out),
    get: id => { const r = row(id); return r ? out(r) : null; },
    save(input, source) {
      const chart = check(ChartSchema.safeParse(input));
      const slug = chart.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'chart';
      const id = `${slug}-${random().toString(36).slice(2, 7)}`;
      const kind = chart.kind ?? (source === 'import' ? 'song' : 'exercise');
      db.runSync('INSERT INTO charts (id, json, source) VALUES (?, ?, ?)', [id, JSON.stringify({ ...chart, id: undefined, kind }), source]);
      return out(row(id)!);
    },
    setSyncOffset(id, ms) {
      if (!(ms >= -60_000 && ms <= 60_000)) throw new SongInputError('Invalid request');
      return db.runSync('UPDATE charts SET sync_offset_ms = ? WHERE id = ?', [ms, id]).changes > 0;
    },
    setAudio: (id, file) => db.runSync('UPDATE charts SET audio_file = ? WHERE id = ?', [file, id]).changes > 0,
    remove(id) {
      const r = row(id);
      if (!r) return null;
      db.runSync('DELETE FROM charts WHERE id = ?', [id]);
      return { audioFile: r.audio_file };
    },
  };
}
