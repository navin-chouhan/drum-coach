// The coach's view of the student, from either place it can come from (B22):
// - the web app's own data in this server's SQLite (server/index.ts builds that source), or
// - a `context` the iPad sends with each coach request (D2, D3: the iPad keeps its own data and the server never stores
//   it). Compact JSON: the same run records, settings, lessons and songs the iPad keeps, trimmed to what the route needs.
// The routes read both through `CoachData`, so they build the same model input either way. Pure: it can move to core.
import { z } from 'zod';
import { MonthReportSchema, PlanSchema, RunRecordSchema } from '../src/coach/schemas.ts';
import { ChartNoteSchema, ChartSchema } from '../src/engine/chart.ts';
import type { Genre, Lesson, LessonProgress, Profile } from '../src/engine/lesson.ts';
import type { RunRow } from '../src/engine/progress.ts';
import { TimeSigSchema, type YtSong } from '../src/youtube/schemas.ts';

/** The most a context may weigh, as JSON. The iPad sends what the route needs: recent runs, not its whole history. */
export const CONTEXT_MAX_BYTES = 50_000;

const Id = z.string().min(1).max(80);
const Day = z.string().max(30);
const GENRES = ['rock', 'funk', 'jazz', 'latin'] as const satisfies readonly Genre[];

/** A run as the iPad stores it: the record it would have sent to POST /api/runs, without the take's hits. */
const ContextRunSchema = RunRecordSchema.omit({ take: true }).extend({ summary: RunRecordSchema.shape.summary.optional() });
const ProgressSchema = z.object({
  step: z.number().int().min(0).max(50), bpm: z.number().min(0).max(400), clean: z.number().default(0), fails: z.number().default(0), bestBpm: z.number().default(0),
  completedAt: Day.optional(), reviewStage: z.number().int().default(0), reviewDue: Day.optional(), stars: z.number().int().min(0).max(3).optional(),
  layer: z.number().int().optional(), bestStreak: z.number().optional(), provenAt: Day.optional(), stuck: z.number().int().optional(),
});
const ProfileSchema = z.object({
  goals: z.array(z.enum(GENRES)).max(4), minutesPerDay: z.number().int().min(5).max(180), onboarded: z.boolean().default(true),
  song: z.object({ id: Id, title: z.string().max(200), stage: z.number().int().min(0).max(12) }).optional(),
});
/** A coach-written lesson the iPad saved (what POST /api/coach/lesson returned). Steps keep their other fields as sent. */
const ContextLessonSchema = z.looseObject({
  id: Id, level: z.number().int().min(0).max(12), kind: z.enum(['groove', 'rudiment', 'fill', 'song', 'exercise']), title: z.string().max(200),
  what: z.string().max(2000).default(''), why: z.string().max(2000).default(''), how: z.string().max(2000).default(''),
  source: z.literal('ai').optional(), checkpoint: Id.optional(), tags: z.array(z.enum(GENRES)).max(4).optional(),
  steps: z.array(z.looseObject({ title: z.string().max(200), text: z.string().max(2000).default(''), chart: ChartSchema, bpm: z.object({ start: z.number(), target: z.number() }) })).min(1).max(12),
});
/** A saved YouTube song: only what the coach reads (bites are cut from its notes). */
const ContextSongSchema = z.object({ id: Id, title: z.string().max(200), timeSignature: TimeSigSchema.default([4, 4]), notes: z.array(ChartNoteSchema).max(20_000).default([]) });
/** A coach exercise the iPad saved, for the catalog the coach may suggest from. */
const ContextChartSchema = z.object({
  id: Id, title: z.string().max(120), kind: ChartSchema.shape.kind, level: ChartSchema.shape.level, bpm: ChartSchema.shape.bpm,
  timeSignature: ChartSchema.shape.timeSignature.optional(), description: ChartSchema.shape.description,
});

export const CoachContextSchema = z.object({
  runs: z.array(ContextRunSchema).max(1000).optional(), // any order
  settings: z.object({ profile: ProfileSchema.optional(), lessons: z.record(Id, ProgressSchema).optional(), soreUntil: Day.optional() }).optional(),
  plan: PlanSchema.pick({ focus: true, why: true, drums: true, notes: true, week: true }).optional(), // this week's plan
  teacherNotes: z.array(z.object({ date: Day, text: z.string().max(4000) })).max(50).optional(),
  aiLessons: z.array(ContextLessonSchema).max(100).optional(),
  songs: z.array(ContextSongSchema).max(100).optional(),
  charts: z.array(ContextChartSchema).max(200).optional(),
  monthReport: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), report: MonthReportSchema }).optional(), // the last one written
});
export type CoachContext = z.infer<typeof CoachContextSchema>;

/**
 * Takes `context` out of a request body. `rest` is the body without it, for the route's own schema (unchanged when
 * there's no context). An error is the 400 to send.
 */
export function splitContext(body: unknown): { rest: unknown; context?: CoachContext; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('context' in body)) return { rest: body };
  const { context, ...rest } = body as Record<string, unknown>;
  if (context === undefined) return { rest };
  if (Buffer.byteLength(JSON.stringify(context) ?? '', 'utf8') > CONTEXT_MAX_BYTES) return { rest, error: `context: larger than ${CONTEXT_MAX_BYTES / 1000} KB; send fewer runs, lessons or songs` };
  const c = CoachContextSchema.safeParse(context);
  if (!c.success) return { rest, error: `context.${c.error.issues[0]?.path.join('.')}: ${c.error.issues[0]?.message}` };
  return { rest, context: c.data };
}

export type Settings = { profile?: Profile; lessons?: Record<string, LessonProgress>; soreUntil?: string };
export type PlanNotes = { focus?: string; why?: string; drums?: string[]; notes?: string; week?: string };
export type CatalogEntry = { id: string; title: string; kind?: string; level?: number; bpm: number; timeSignature?: [number, number]; description?: string };
export type PastTake = { at: string; bpm: number; accuracyPct: number; meanOffsetMs: number; spreadMs: number };
export type RecentRun = { chart: string; at: string; bpm: number; accuracy: number; summary: Record<string, unknown> };

/** What the coach routes read about the student. Runs come oldest first, like runRows. */
export type CoachData = {
  fromDevice: boolean; // true: the iPad's context, so nothing is written back to this server's tables
  runRows(limit?: number): RunRow[];
  settings(): Settings;
  plan(): PlanNotes | undefined;
  teacherNotes(): { date: string; text: string }[]; // the latest 3
  aiLessons(): Lesson[];
  songs(): YtSong[];
  song(id: string): YtSong | undefined;
  savedCharts(): CatalogEntry[];
  recentForLesson(): RecentRun[]; // the latest 15 runs with their summaries
  pastTakes(chartId: string): PastTake[]; // the latest 5 on this exercise
  monthReport(): { month: string; report: unknown } | undefined;
};

/** This week's focus from the coach's plan, for the lesson writer and the live coach (R6). */
export const weekFocus = (d: CoachData) => { const p = d.plan(); return p?.focus ? { focus: p.focus, why: p.why, drums: p.drums } : undefined; };

const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {});

/** A run record as the row runRows reads (the same summary fields as its json_extract calls). */
export function runRowOf(r: z.infer<typeof ContextRunSchema>): RunRow {
  const s = r.summary ?? {}, section = obj(s.section), lesson = obj(s.lesson);
  return {
    hasTake: false, chartId: r.chartId, chartTitle: r.chartTitle, level: r.level, startedAt: r.startedAt, durationS: r.durationS,
    bpm: r.bpm, speed: r.speed, accuracy: r.accuracy, meanOffset: r.meanOffset, spread: r.spread, notes: num(s.notes),
    fromBar: num(section.fromBar), toBar: num(section.toBar), tips: Array.isArray(s.tipIds) ? s.tipIds as string[] : undefined,
    perDrum: s.perDrum ? s.perDrum as RunRow['perDrum'] : undefined, tool: typeof lesson.tool === 'string' ? lesson.tool : undefined,
    bite: lesson.bite ? lesson.bite as RunRow['bite'] : undefined,
  };
}

/** The coach's data from the iPad's context. */
export function contextData(c: CoachContext): CoachData {
  const runs = [...(c.runs ?? [])].sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0)); // oldest first
  const songs: YtSong[] = (c.songs ?? []).map(s => ({ id: s.id, title: s.title, originalId: '', drumlessId: null, coverId: null, timeSignature: s.timeSignature, notes: s.notes, grids: {}, verifiedAt: null }));
  const latest = (n: number) => (n > 0 ? runs.slice(-n) : []);
  return {
    fromDevice: true,
    runRows: (limit = 5000) => latest(limit).map(runRowOf),
    settings: () => (c.settings ?? {}),
    plan: () => c.plan,
    teacherNotes: () => (c.teacherNotes ?? []).slice(-3),
    aiLessons: () => c.aiLessons ?? [],
    songs: () => songs,
    song: id => songs.find(s => s.id === id),
    savedCharts: () => c.charts ?? [],
    recentForLesson: () => latest(15).map(r => {
      const { weakSpots, perDrum, velocity, meanOffsetMs, spreadMs, lesson } = r.summary ?? {};
      return { chart: r.chartTitle, at: r.startedAt.slice(0, 16), bpm: Math.round(r.bpm), accuracy: r.accuracy, summary: { meanOffsetMs, spreadMs, perDrum, velocity, weakSpots, lesson } };
    }),
    pastTakes: chartId => runs.filter(r => r.chartId === chartId).slice(-5)
      .map(r => ({ at: r.startedAt.slice(0, 16), bpm: Math.round(r.bpm), accuracyPct: r.accuracy, meanOffsetMs: r.meanOffset, spreadMs: r.spread })),
    monthReport: () => c.monthReport,
  };
}
