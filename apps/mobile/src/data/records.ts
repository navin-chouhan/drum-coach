// The other server tables on the device: settings (server-only keys), plans and coach-written lessons. Row shapes
// and the JSON they hold are the server's (server/index.ts latestPlan, aiLessons, GET /api/settings).
import { KV_KEYS, type Kv } from './kv';
import type { SqlDb } from './sql';

const parse = (text: string | null | undefined): unknown => {
  if (text == null) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
};

/**
 * Settings rows. On the web, `app`, `noteMap.<kit>` and `padCal.<kit>` are mirrors of localStorage; on the iPad those
 * live only in the key-value store (one copy, no sync, D3), and this table holds the keys that were only ever on the
 * server: `teacherNotes`, `monthReport`.
 */
export type SettingsRepo = {
  get(key: string): unknown;
  put(key: string, value: unknown): void;
  /** GET /api/settings: every row, plus `app`, `noteMap.<kit>` and `padCal.<kit>` from the key-value store. */
  all(): Record<string, unknown>;
};

export function createSettingsRepo(db: SqlDb, kv: Kv): SettingsRepo {
  const KV_MIRRORS = [['noteMap.', 'drumcoach.noteMap.'], ['padCal.', 'drumcoach.padCal.']] as const;
  return {
    get: key => parse(db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value),
    put: (key, value) => { db.runSync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value ?? null)]); },
    all() {
      const out: Record<string, unknown> = {};
      for (const r of db.getAllSync<{ key: string; value: string }>('SELECT key, value FROM settings', [])) out[r.key] = parse(r.value);
      const app = parse(kv.get(KV_KEYS.settings));
      if (app !== undefined) out.app = app;
      for (const [serverPrefix, kvPrefix] of KV_MIRRORS) {
        for (const k of kv.keys(kvPrefix)) {
          const v = parse(kv.get(k));
          if (v !== undefined) out[serverPrefix + k.slice(kvPrefix.length)] = v;
        }
      }
      return out;
    },
  };
}

/** GET /api/plan's shape. `plan` is what POST /api/coach/plan returned (PlanSchema). */
export type PlanRecord = { id: number; plan: Record<string, unknown>; checks: Record<string, unknown> };

export type PlansRepo = {
  latest(): Promise<PlanRecord | null>;
  /** Keeps a plan the coach wrote (the iPad stores it: the server sends no id with a context). */
  add(plan: Record<string, unknown>): number;
  /** PUT /api/plan/:id/checks. False when there is no such plan. */
  setChecks(id: number, checks: Record<string, unknown>): boolean;
};

export function createPlansRepo(db: SqlDb): PlansRepo {
  return {
    async latest() {
      const row = await db.getFirstAsync<{ id: number; json: string; checks_json: string }>('SELECT * FROM plans ORDER BY id DESC LIMIT 1', []);
      if (!row) return null;
      const plan = parse(row.json), checks = parse(row.checks_json);
      return { id: row.id, plan: isObject(plan) ? plan : {}, checks: isObject(checks) ? checks : {} };
    },
    add: plan => db.runSync('INSERT INTO plans (json) VALUES (?)', [JSON.stringify(plan)]).lastInsertRowId,
    setChecks: (id, checks) => db.runSync('UPDATE plans SET checks_json = ? WHERE id = ?', [JSON.stringify(checks), id]).changes > 0,
  };
}

/** A coach-written lesson as POST /api/coach/lesson returned it (AiLessonSchema → Lesson); `id` is required. */
export type AiLesson = Record<string, unknown> & { id: string };

export type AiLessonsRepo = {
  /** GET /api/lessons: oldest first. */
  list(): Promise<AiLesson[]>;
  put(lesson: AiLesson): void;
  /** DELETE /api/lessons/:id. False when there was none. */
  remove(id: string): boolean;
  /** Applies a lesson answer: drops the lessons it `replaces`, keeps the new one, in one transaction. */
  replace(lesson: AiLesson, replaces: string[]): void;
};

export function createAiLessonsRepo(db: SqlDb): AiLessonsRepo {
  const put = (lesson: AiLesson) => {
    if (typeof lesson.id !== 'string' || !lesson.id) throw new Error('lesson.id: required');
    db.runSync('INSERT OR REPLACE INTO ai_lessons (id, json) VALUES (?, ?)', [lesson.id, JSON.stringify(lesson)]);
  };
  return {
    async list() {
      const rows = await db.getAllAsync<{ json: string }>('SELECT json FROM ai_lessons ORDER BY created_at, rowid', []);
      return rows.map(r => parse(r.json)).filter((l): l is AiLesson => isObject(l) && typeof l.id === 'string');
    },
    put,
    remove: id => db.runSync('DELETE FROM ai_lessons WHERE id = ?', [id]).changes > 0,
    replace(lesson, replaces) {
      db.withTransactionSync(() => {
        for (const id of replaces) if (id !== lesson.id) db.runSync('DELETE FROM ai_lessons WHERE id = ?', [id]);
        put(lesson);
      });
    },
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
