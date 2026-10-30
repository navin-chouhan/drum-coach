// Runs (takes) on the device, shaped like the web's POST /api/runs (in) and GET /api/runs (out), with the take's
// hits kept under the same cap as the server (server/index.ts). RunInputSchema copies the web's RunRecordSchema
// (src/coach/schemas.ts) until @drum-coach/core exports it; runs.test.ts checks the two agree.
import { z } from 'zod';
import type { SqlDb } from './sql';

export const RunTakeSchema = z.object({
  beatMs: z.number().positive().max(5000), beats: z.number().positive().max(10_000), beatsPerBar: z.number().positive().max(32),
  timeSignature: z.tuple([z.number().int().min(1).max(32), z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)])]),
  hits: z.array(z.tuple([z.number(), z.string().max(12), z.number().int().min(0).max(127)])).max(4000), // [ms from beat 0, pad, velocity]
});
export const RunInputSchema = z.object({
  chartId: z.string().max(80), chartTitle: z.string().max(200), level: z.number().int().min(0).max(12).optional(),
  startedAt: z.string().datetime(), durationS: z.number().min(0).max(36_000),
  bpm: z.number().min(10).max(400), speed: z.number().min(0.25).max(2),
  accuracy: z.number().min(0).max(100), meanOffset: z.number(), spread: z.number().min(0),
  summary: z.record(z.string(), z.unknown()),
  take: RunTakeSchema.optional(),
});
export type RunTake = z.infer<typeof RunTakeSchema>;
/** What a finished take saves (the web's RunRecord without `id`). */
export type RunInput = z.infer<typeof RunInputSchema>;
/** A stored run as the coach context sends it: the input without the take's hits. */
export type StoredRun = Omit<RunInput, 'take'> & { id: number };

/** GET /api/runs's row (the web's RunRow, src/engine/progress.ts). */
export type RunRow = {
  id?: number; hasTake?: boolean;
  chartId: string; chartTitle: string; level?: number; startedAt: string; durationS: number;
  bpm: number; speed: number; accuracy: number; meanOffset: number; spread: number;
  notes?: number; fromBar?: number; toBar?: number; tips?: string[];
  perDrum?: Record<string, { notes: number; accuracyPct: number; meanOffsetMs: number }>;
  bite?: { songId: string; fromBar: number; toBar: number };
  tool?: string;
};

/** The server's take cap: the latest 300 takes, plus the first take of each exercise each month ("you a month ago"). */
export const TAKE_CAP_SQL = `DELETE FROM run_hits WHERE run_id NOT IN (SELECT id FROM runs ORDER BY id DESC LIMIT 300)
  AND run_id NOT IN (SELECT MIN(r.id) FROM runs r JOIN run_hits h ON h.run_id = r.id GROUP BY r.chart_id, substr(r.started_at, 1, 7))`;

// The server's runRows query (server/index.ts), with an optional lower bound on started_at.
const ROWS_SQL = (since: boolean) => `
  SELECT * FROM (SELECT id, EXISTS(SELECT 1 FROM run_hits h WHERE h.run_id = runs.id) AS hasTake, chart_id AS chartId, chart_title AS chartTitle, level, started_at AS startedAt, duration_s AS durationS,
    bpm, speed, accuracy, mean_offset AS meanOffset, spread, json_extract(summary_json, '$.notes') AS notes,
    json_extract(summary_json, '$.section.fromBar') AS fromBar, json_extract(summary_json, '$.section.toBar') AS toBar, json_extract(summary_json, '$.tipIds') AS tips,
    json_extract(summary_json, '$.perDrum') AS perDrum, json_extract(summary_json, '$.lesson.tool') AS tool, json_extract(summary_json, '$.lesson.bite') AS bite
    FROM runs${since ? ' WHERE started_at >= ?' : ''} ORDER BY started_at DESC LIMIT ?) ORDER BY startedAt`;

/** The SQL row the query above returns (json_extract gives JSON text for objects and arrays, null when absent). */
export type RunSqlRow = Omit<RunRow, 'hasTake' | 'level' | 'notes' | 'fromBar' | 'toBar' | 'tips' | 'perDrum' | 'bite' | 'tool'> & {
  hasTake: number; level: number | null; notes: number | null; fromBar: number | null; toBar: number | null;
  tips: string | null; perDrum: string | null; bite: string | null; tool: string | null;
};

const json = <T>(text: string | null): T | undefined => {
  if (text == null) return undefined;
  try { return JSON.parse(text) as T; } catch { return undefined; }
};

/** The server's runRows mapping: SQL nulls become absent fields, JSON columns are parsed. */
export function runRowOf(r: RunSqlRow): RunRow {
  return {
    ...r, hasTake: !!r.hasTake, level: r.level ?? undefined, notes: r.notes ?? undefined, fromBar: r.fromBar ?? undefined,
    toBar: r.toBar ?? undefined, tips: json<string[]>(r.tips), perDrum: json<RunRow['perDrum']>(r.perDrum), tool: r.tool ?? undefined,
    bite: json<RunRow['bite']>(r.bite),
  };
}

export class InvalidRunError extends Error {}

export type RunsRepo = {
  /** Validates and saves a take; resolves to its id (as a string, per the Storage contract). Rejects on bad input. */
  add(run: unknown): Promise<string>;
  /** GET /api/runs: the latest `limit` (default 5000) runs since `since` (ms since the epoch), oldest first. */
  list(q?: { since?: number; limit?: number }): Promise<RunRow[]>;
  /** GET /api/runs/:id/take: the take's hits, or null when none were kept. */
  take(id: string): Promise<RunTake | null>;
  /** The latest `limit` runs with their summaries (no hits), newest first: what the coach context sends. */
  recent(limit: number): Promise<StoredRun[]>;
};

export function createRunsRepo(db: SqlDb): RunsRepo {
  return {
    async add(input) {
      const p = RunInputSchema.safeParse(input);
      if (!p.success) {
        const i = p.error.issues[0];
        throw new InvalidRunError(`run.${i?.path.join('.')}: ${i?.message}`);
      }
      const r = p.data;
      let id = 0;
      db.withTransactionSync(() => {
        id = db.runSync(`INSERT INTO runs (chart_id, chart_title, level, started_at, duration_s, bpm, speed, accuracy, mean_offset, spread, summary_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.chartId, r.chartTitle, r.level ?? null, r.startedAt, r.durationS, r.bpm, r.speed, r.accuracy, r.meanOffset, r.spread, JSON.stringify(r.summary)]).lastInsertRowId;
        if (r.take) {
          db.runSync('INSERT OR REPLACE INTO run_hits (run_id, json) VALUES (?, ?)', [id, JSON.stringify(r.take)]);
          db.execSync(TAKE_CAP_SQL);
        }
      });
      return String(id);
    },
    async list(q = {}) {
      const limit = Math.max(0, Math.floor(q.limit ?? 5000));
      const params = q.since === undefined ? [limit] : [new Date(q.since).toISOString(), limit];
      return (await db.getAllAsync<RunSqlRow>(ROWS_SQL(q.since !== undefined), params)).map(runRowOf);
    },
    async take(id) {
      if (!/^\d{1,15}$/.test(id)) return null;
      const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM run_hits WHERE run_id = ?', [Number(id)]);
      return row ? json<RunTake>(row.json) ?? null : null;
    },
    async recent(limit) {
      type Row = { id: number; chart_id: string; chart_title: string; level: number | null; started_at: string; duration_s: number; bpm: number;
        speed: number; accuracy: number; mean_offset: number; spread: number; summary_json: string };
      const rows = await db.getAllAsync<Row>('SELECT * FROM runs ORDER BY started_at DESC, id DESC LIMIT ?', [Math.max(0, Math.floor(limit))]);
      return rows.map(r => ({
        id: r.id, chartId: r.chart_id, chartTitle: r.chart_title, ...(r.level != null && { level: r.level }), startedAt: r.started_at,
        durationS: r.duration_s, bpm: r.bpm, speed: r.speed, accuracy: r.accuracy, meanOffset: r.mean_offset, spread: r.spread,
        summary: json<Record<string, unknown>>(r.summary_json) ?? {},
      }));
    },
  };
}
