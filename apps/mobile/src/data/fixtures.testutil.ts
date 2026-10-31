// Test helper: run records like the web's Results screen saves, and a loader for the web/server modules the parity
// tests compare against (imported by path at run time so the app's tsc never compiles web or server code).
import type { RunInput } from './runs';

export function runInput(i: number, over: Partial<RunInput> = {}): RunInput {
  const at = new Date(Date.UTC(2026, 9, 1, 12, 0, 0) + i * 3_600_000).toISOString();
  return {
    chartId: `chart-${i % 3}`, chartTitle: `Groove ${i % 3}`, level: i % 4, startedAt: at, durationS: 60 + i,
    bpm: 80 + (i % 100), speed: 1, accuracy: 70 + (i % 30), meanOffset: -3.5 + i / 10, spread: 12.25,
    summary: {
      notes: 32, section: { fromBar: 1, toBar: 4 }, tipIds: ['rush'], perDrum: { snare: { notes: 16, accuracyPct: 90, meanOffsetMs: -2 } },
      lesson: { tool: 'drill' }, weakSpots: [{ bar: 2, beat: 3 }], velocity: { mean: 80 }, meanOffsetMs: -3.5, spreadMs: 12.25,
      bars: Array.from({ length: 8 }, (_, b) => ({ b, ok: true })), // the kind of bulk the coach doesn't read
    },
    ...over,
  };
}

export const take = (n = 4) => ({
  beatMs: 500, beats: 16, beatsPerBar: 4, timeSignature: [4, 4] as [number, 4],
  hits: Array.from({ length: n }, (_, k) => [k * 500 + 3, k % 2 ? 'snare' : 'kick', 90] as [number, string, number]),
});

type SafeParse = { safeParse(v: unknown): { success: boolean; data?: unknown; error?: { issues: { path: PropertyKey[]; message: string }[] } } };
type JsonSchemaSource = { toJSONSchema(params?: { io?: 'input' | 'output'; unrepresentable?: 'any' | 'throw' }): unknown };
/** A zod schema from the other zod copy (the repo root's), seen only through what the parity tests call. */
export type ZodLike = JsonSchemaSource & SafeParse & { unwrap(): ZodLike; element: ZodLike; shape: Record<string, ZodLike> };

/** The repo root, from apps/mobile/src/data. */
const ROOT = new URL('../../../../', import.meta.url);

export async function webSchemas() {
  const path = new URL('src/coach/schemas.ts', ROOT).href;
  return (await import(/* @vite-ignore */ path)) as { RunRecordSchema: SafeParse & JsonSchemaSource; PlanSchema: { pick(m: object): JsonSchemaSource }; MonthReportSchema: JsonSchemaSource };
}

export async function serverContext() {
  const path = new URL('server/coachContext.ts', ROOT).href;
  return (await import(/* @vite-ignore */ path)) as {
    CONTEXT_MAX_BYTES: number;
    CoachContextSchema: ZodLike;
    splitContext: (body: unknown) => { rest: unknown; context?: unknown; error?: string };
    contextData: (c: unknown) => { runRows(limit?: number): Record<string, unknown>[]; recentForLesson(): unknown[]; pastTakes(id: string): unknown[]; teacherNotes(): unknown[]; aiLessons(): { id: string }[] };
  };
}
