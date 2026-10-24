import { z } from 'zod';
import { CHART_DRUMS, ChartSchema } from '../engine/chart.ts';

// Shapes the coach must answer with. Validated on the server before anything reaches the app.
export const FeedbackSchema = z.object({
  feedback: z.string().min(1).max(2000),
  drill: z.object({
    title: z.string().max(120),
    instructions: z.string().max(1000),
    bpm: z.number().min(30).max(300).optional(),
    chartId: z.string().max(80).optional(),
    chart: ChartSchema.optional(),
  }),
});
export const NextSchema = z.object({ chartId: z.string().max(80), bpm: z.number().min(30).max(300), reason: z.string().max(800) });
export const PlanSchema = z.object({
  title: z.string().max(120),
  days: z.array(z.object({
    day: z.string().max(30),
    items: z.array(z.object({
      title: z.string().max(120), minutes: z.number().min(1).max(120),
      chartId: z.string().max(80).optional(), bpm: z.number().min(30).max(300).optional(), notes: z.string().max(300).optional(),
    })).max(10),
  })).min(1).max(7),
});
export const ChatReplySchema = z.object({ reply: z.string().min(1).max(4000), chart: ChartSchema.optional() });

/** A lesson the coach writes for this student (see server/prompts/lesson.md). */
export const AiLessonSchema = z.object({
  title: z.string().min(1).max(80),
  kind: z.enum(['groove', 'rudiment', 'fill', 'song', 'exercise']),
  focus: z.string().max(400),
  what: z.string().max(400), why: z.string().max(600), how: z.string().max(1200),
  steps: z.array(z.object({
    title: z.string().min(1).max(60), text: z.string().max(400),
    chart: ChartSchema,
    activeLanes: z.array(z.enum(CHART_DRUMS)).min(1).optional(),
    bpm: z.object({ start: z.number().min(30).max(300), target: z.number().min(30).max(300) }),
    pass: z.object({
      accuracy: z.number().min(50).max(100), maxExtraPct: z.number().min(0).max(100), maxAbsOffsetMs: z.number().min(5).max(100),
      maxVelocityCv: z.number().min(3).max(100), maxGhostToAccent: z.number().min(0.1).max(1),
    }).partial().optional(),
    gapBars: z.number().int().min(2).max(8).optional(),
  }).refine(s => s.bpm.start <= s.bpm.target, { message: 'bpm.start must not exceed bpm.target' })
    .refine(s => (s.activeLanes ?? []).every(d => s.chart.notes.some(n => n.drum === d)), { message: 'every active lane needs notes in the chart' }))
    .min(1).max(4),
});
export const LessonRequestSchema = z.object({
  struggle: z.object({ lessonId: z.string().max(80), step: z.number().int().min(1).max(10), reason: z.string().max(400), run: z.record(z.string(), z.unknown()) }).optional(),
});
export type AiLesson = z.infer<typeof AiLessonSchema>;

export type Feedback = z.infer<typeof FeedbackSchema>;
export type NextExercise = z.infer<typeof NextSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type ChatReply = z.infer<typeof ChatReplySchema>;

// Requests from the browser (validated at the server boundary).
export const RunRecordSchema = z.object({
  chartId: z.string().max(80), chartTitle: z.string().max(120), level: z.number().int().min(1).max(10).optional(),
  startedAt: z.string().datetime(), durationS: z.number().min(0).max(36_000),
  bpm: z.number().min(10).max(400), speed: z.number().min(0.25).max(2),
  accuracy: z.number().min(0).max(100), meanOffset: z.number(), spread: z.number().min(0),
  summary: z.record(z.string(), z.unknown()),
});
export type RunRecord = z.infer<typeof RunRecordSchema> & { id: number };
export const ChatRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) })).min(1).max(30),
});
export const PlanRequestSchema = z.object({
  goals: z.string().min(1).max(500), minutesPerDay: z.number().int().min(5).max(180), daysPerWeek: z.number().int().min(1).max(7),
});
