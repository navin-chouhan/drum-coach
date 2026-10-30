// The coach `context` the iPad sends with each coach request (B22, D2, D3): its own runs, settings, lesson progress,
// plan, notes and lessons, in the schema server/coachContext.ts accepts, trimmed to at most CONTEXT_MAX_BYTES of JSON
// (most recent first). Pure: it takes what storage read and returns the JSON object to put in the request body.
//
// The small sub-schemas below copy the server's (runs, settings, plan, teacher notes, month report) so one bad local
// entry is dropped here instead of failing the whole request with a 400; coachContext.test.ts checks them against
// server/coachContext.ts and runs the output through the server's own CoachContextSchema.
import { z } from 'zod';
import { RunInputSchema, type StoredRun } from './runs';

/** server/coachContext.ts CONTEXT_MAX_BYTES (checked by a parity test). */
export const CONTEXT_MAX_BYTES = 50_000;
/** Runs the trimmer keeps before it drops songs, exercises, lessons or notes to make room. */
export const MIN_RUNS = 20;

const Id = z.string().min(1).max(80);
const Day = z.string().max(30);
const GENRES = ['rock', 'funk', 'jazz', 'latin'] as const;

export const ContextRunSchema = RunInputSchema.omit({ take: true }).extend({ summary: RunInputSchema.shape.summary.optional() });
export const ProgressSchema = z.object({
  step: z.number().int().min(0).max(50), bpm: z.number().min(0).max(400), clean: z.number().default(0), fails: z.number().default(0), bestBpm: z.number().default(0),
  completedAt: Day.optional(), reviewStage: z.number().int().default(0), reviewDue: Day.optional(), stars: z.number().int().min(0).max(3).optional(),
  layer: z.number().int().optional(), bestStreak: z.number().optional(), provenAt: Day.optional(), stuck: z.number().int().optional(),
});
export const ProfileSchema = z.object({
  goals: z.array(z.enum(GENRES)).max(4), minutesPerDay: z.number().int().min(5).max(180), onboarded: z.boolean().default(true),
  song: z.object({ id: Id, title: z.string().max(200), stage: z.number().int().min(0).max(12) }).optional(),
});
export const SettingsSchema = z.object({ profile: ProfileSchema.optional(), lessons: z.record(Id, ProgressSchema).optional(), soreUntil: Day.optional() });
const optionalText = (max: number) => z.string().max(max).nullish().transform(v => v ?? undefined);
/** PlanSchema.pick({ focus, why, drums, notes, week }). */
export const PlanNotesSchema = z.object({
  focus: optionalText(120), why: optionalText(300),
  drums: z.array(z.string().max(20)).max(4).nullish().transform(v => v ?? undefined),
  notes: optionalText(1000), week: z.string().max(10).optional(),
});
export const TeacherNoteSchema = z.object({ date: Day, text: z.string().max(4000) });
export const MonthReportSchema = z.object({ headline: z.string().max(200), better: z.array(z.string().max(300)).max(4), next: z.array(z.string().max(300)).max(3), note: z.string().max(600) });
export const KeptMonthReportSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), report: MonthReportSchema });

/** The routes that take a context, and what each reads (docs/mobile/HOME-SERVER.md). */
export type CoachRoute = 'feedback' | 'plan' | 'lesson' | 'month' | 'session';
type Field = 'runs' | 'settings' | 'plan' | 'teacherNotes' | 'aiLessons' | 'songs' | 'charts' | 'monthReport';
export const ROUTE_FIELDS: Record<CoachRoute, readonly Field[]> = {
  feedback: ['charts'],
  plan: ['runs', 'settings', 'aiLessons', 'plan', 'teacherNotes', 'songs', 'charts'],
  lesson: ['runs', 'settings', 'aiLessons', 'plan', 'teacherNotes', 'songs'],
  month: ['runs', 'settings', 'aiLessons', 'teacherNotes', 'monthReport'],
  session: ['runs', 'settings', 'plan', 'teacherNotes'],
};
/** The plan route reads a song's id and title only; the lesson route also needs its notes (for song bites). */
const SONG_NOTES: Record<CoachRoute, boolean> = { feedback: false, plan: false, lesson: true, month: false, session: false };
/** The summary fields the server reads (runRowOf and recentForLesson); the rest of a summary stays on the iPad. */
export const SUMMARY_KEYS = ['notes', 'section', 'tipIds', 'perDrum', 'lesson', 'weakSpots', 'velocity', 'meanOffsetMs', 'spreadMs'] as const;
/** The server reads the latest 3 teacher notes. */
const TEACHER_NOTES = 3;

/** What storage read (src/platform/storage.ts loadContextSource). Lists may be in any order unless noted. */
export type ContextSource = {
  runs: StoredRun[];
  /** The parsed `drumcoach.settings` value (the web Settings): profile, lessons, soreUntil are read. */
  appSettings?: unknown;
  /** The latest plan (PlanRecord.plan). */
  plan?: unknown;
  /** The `teacherNotes` setting, oldest first. */
  teacherNotes?: unknown;
  /** Coach-written lessons, oldest first. */
  aiLessons?: unknown[];
  /** Saved YouTube songs (Songs is after v1), newest first. */
  songs?: unknown[];
  /** Saved coach exercises for the catalog, newest first. */
  charts?: unknown[];
  /** The `monthReport` setting. */
  monthReport?: unknown;
};

type ContextRun = z.infer<typeof ContextRunSchema>;
export type CoachContext = {
  runs?: ContextRun[];
  settings?: z.infer<typeof SettingsSchema>;
  plan?: z.infer<typeof PlanNotesSchema>;
  teacherNotes?: z.infer<typeof TeacherNoteSchema>[];
  aiLessons?: Record<string, unknown>[];
  songs?: Record<string, unknown>[];
  charts?: Record<string, unknown>[];
  monthReport?: z.infer<typeof KeptMonthReportSchema>;
};
export type BuiltContext = {
  context: CoachContext;
  /** UTF-8 bytes of JSON.stringify(context), as the server measures it. */
  bytes: number;
  /** How many of each list went in, out of how many there were. */
  kept: Partial<Record<'runs' | 'aiLessons' | 'songs' | 'charts' | 'teacherNotes', { sent: number; of: number }>>;
  /** Fields dropped because they were invalid or, as a last resort, too big. */
  dropped: string[];
};

/** UTF-8 length of a string (Buffer.byteLength without Buffer; JSON.stringify output has no lone surrogates). */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function slimRun(r: StoredRun): ContextRun | null {
  const summary: Record<string, unknown> = {};
  for (const k of SUMMARY_KEYS) if (r.summary?.[k] !== undefined) summary[k] = r.summary[k];
  const { id: _id, ...rest } = r;
  const p = ContextRunSchema.safeParse({ ...rest, summary });
  return p.success ? p.data : null;
}

function cleanSettings(v: unknown, dropped: string[]): CoachContext['settings'] {
  if (!isObject(v)) return undefined;
  const out: NonNullable<CoachContext['settings']> = {};
  if (v.profile !== undefined) {
    const p = ProfileSchema.safeParse(v.profile);
    if (p.success) out.profile = p.data; else dropped.push('settings.profile');
  }
  if (isObject(v.lessons)) {
    const lessons: Record<string, z.infer<typeof ProgressSchema>> = {};
    for (const [id, prog] of Object.entries(v.lessons)) {
      const p = ProgressSchema.safeParse(prog);
      if (p.success && Id.safeParse(id).success) lessons[id] = p.data; else dropped.push(`settings.lessons.${id}`);
    }
    out.lessons = lessons;
  }
  if (v.soreUntil !== undefined) {
    if (Day.safeParse(v.soreUntil).success) out.soreUntil = v.soreUntil as string; else dropped.push('settings.soreUntil');
  }
  return out;
}

const valid = <S extends z.ZodType>(schema: S, v: unknown, name: string, dropped: string[]): z.infer<S> | undefined => {
  if (v === undefined || v === null) return undefined;
  const p = schema.safeParse(v);
  if (!p.success) dropped.push(name);
  return p.success ? p.data : undefined;
};

/** A coach lesson needs an id and steps (the server checks the rest); a song an id and title; an exercise an id and title. */
const objectsWith = (list: unknown[] | undefined, keys: string[], max: number) =>
  (list ?? []).filter((x): x is Record<string, unknown> => isObject(x) && keys.every(k => x[k] !== undefined)).slice(0, max);

/**
 * Builds the context for one coach route from what storage read: only the fields that route reads, each entry
 * checked, runs newest first with only the summary fields the coach reads, then trimmed to `maxBytes`. Trimming drops
 * the oldest runs first; when fewer than MIN_RUNS would fit, it first drops the oldest songs, exercises, coach lessons
 * and teacher notes (in that order), then fills the rest with runs.
 */
export function buildCoachContext(src: ContextSource, route: CoachRoute, maxBytes = CONTEXT_MAX_BYTES): BuiltContext {
  const want = new Set(ROUTE_FIELDS[route]);
  const dropped: string[] = [];

  // ---- the fixed part
  const fixed: CoachContext = {};
  if (want.has('settings')) fixed.settings = cleanSettings(src.appSettings, dropped);
  if (want.has('plan')) fixed.plan = valid(PlanNotesSchema, isObject(src.plan) ? pick(src.plan, ['focus', 'why', 'drums', 'notes', 'week']) : src.plan, 'plan', dropped);
  if (want.has('monthReport')) fixed.monthReport = valid(KeptMonthReportSchema, src.monthReport, 'monthReport', dropped);

  // ---- the lists, most valuable first within each
  const lists = {
    runs: want.has('runs') ? [...src.runs].sort(newestFirst).map(slimRun).filter((r): r is ContextRun => r !== null).slice(0, 1000) : [],
    songs: want.has('songs') ? objectsWith(src.songs, ['id', 'title'], 100).map(s => (SONG_NOTES[route] ? s : { id: s.id, title: s.title, ...(s.timeSignature !== undefined && { timeSignature: s.timeSignature }) })) : [],
    charts: want.has('charts') ? objectsWith(src.charts, ['id', 'title'], 200) : [],
    aiLessons: want.has('aiLessons') ? objectsWith(src.aiLessons, ['id', 'steps'], Infinity).reverse().slice(0, 100) : [],
    teacherNotes: want.has('teacherNotes') && Array.isArray(src.teacherNotes)
      ? src.teacherNotes.map(n => TeacherNoteSchema.safeParse(n)).filter(p => p.success).map(p => p.data!).slice(-TEACHER_NOTES).reverse() // newest first while trimming
      : [],
  };
  if (want.has('runs') && lists.runs.length < Math.min(src.runs.length, 1000)) dropped.push(`runs: ${Math.min(src.runs.length, 1000) - lists.runs.length} invalid`);
  type ListName = keyof typeof lists;
  const names = Object.keys(lists) as ListName[];

  // ---- sizes: the skeleton (every list empty) plus each item's JSON and its comma, so no re-stringifying per step
  const size = (v: unknown) => utf8Length(JSON.stringify(v));
  const itemSizes = Object.fromEntries(names.map(n => [n, (lists[n] as unknown[]).map(size)])) as Record<ListName, number[]>;
  const count = Object.fromEntries(names.map(n => [n, lists[n].length])) as Record<ListName, number>;
  let base = size({ ...fixed, ...Object.fromEntries(names.map(n => [n, []])) });
  const listBytes = (n: ListName, k = count[n]) => { let s = 0; for (let i = 0; i < k; i++) s += itemSizes[n][i]; return s + Math.max(0, k - 1); };
  const total = () => base + names.reduce((s, n) => s + listBytes(n), 0);
  const fitRuns = () => { // the most runs that fit with everything else as it is
    const others = base + names.filter(n => n !== 'runs').reduce((s, n) => s + listBytes(n), 0);
    let k = 0, bytes = 0;
    while (k < lists.runs.length && others + bytes + itemSizes.runs[k] + (k > 0 ? 1 : 0) <= maxBytes) { bytes += itemSizes.runs[k] + (k > 0 ? 1 : 0); k++; }
    return k;
  };

  count.runs = fitRuns();
  const minRuns = Math.min(MIN_RUNS, lists.runs.length);
  for (const n of ['songs', 'charts', 'aiLessons', 'teacherNotes'] as const) {
    while (count.runs < minRuns && count[n] > 0) { count[n]--; count.runs = fitRuns(); }
  }
  // Last resort (a huge lesson-progress record or plan): drop the fixed fields until the skeleton fits.
  for (const f of ['plan', 'monthReport', 'settings'] as const) {
    if (total() <= maxBytes) break;
    if (fixed[f] === undefined) continue;
    delete fixed[f];
    dropped.push(`${f}: too big`);
    base = size({ ...fixed, ...Object.fromEntries(names.map(n => [n, []])) });
    count.runs = fitRuns();
  }
  if (total() > maxBytes) for (const n of names) count[n] = 0;

  // ---- assemble: empty lists left out; lessons and notes back to oldest first, as the server lists them
  const context: CoachContext = { ...fixed };
  const kept: BuiltContext['kept'] = {};
  for (const n of names) {
    if (!want.has(n)) continue;
    kept[n] = { sent: count[n], of: lists[n].length };
    if (!count[n]) continue;
    const items = lists[n].slice(0, count[n]);
    (context as Record<string, unknown>)[n] = n === 'aiLessons' || n === 'teacherNotes' ? items.reverse() : items;
  }
  for (const k of Object.keys(context) as (keyof CoachContext)[]) if (context[k] === undefined) delete context[k];
  return { context, bytes: size(context), kept, dropped };
}

const newestFirst = (a: { startedAt: string; id?: number }, b: { startedAt: string; id?: number }) =>
  a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : (b.id ?? 0) - (a.id ?? 0);

function pick(o: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}
