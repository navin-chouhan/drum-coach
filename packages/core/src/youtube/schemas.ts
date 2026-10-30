import { z } from 'zod';
import { ChartNoteSchema } from '../engine/chart.ts';

const VideoId = z.string().regex(/^[\w-]{11}$/);
export const TimeSigSchema = z.tuple([z.number().int().min(1).max(16), z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)])]);
export const GridSchema = z.object({ bpm: z.number().min(30).max(300), offsetSec: z.number().min(0).max(36_000) });

export const YtSongCreateSchema = z.object({
  title: z.string().min(1).max(200), originalId: VideoId, drumlessId: VideoId.nullish(), coverId: VideoId.nullish(),
});
export const YtSongPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(), drumlessId: VideoId.nullable().optional(), coverId: VideoId.nullable().optional(),
  timeSignature: TimeSigSchema.optional(), notes: z.array(ChartNoteSchema).max(50_000).optional(),
  verified: z.boolean().optional(), // N4: the student checked the part by ear
});
export const GrooveRequestSchema = z.object({ title: z.string().min(1).max(200), bpm: z.number().min(30).max(300), timeSignature: TimeSigSchema, again: z.boolean().optional() });

export type Grid = z.infer<typeof GridSchema>;
export type YtSong = {
  id: string; title: string; originalId: string; drumlessId: string | null; coverId: string | null;
  timeSignature: [number, 2 | 4 | 8 | 16]; notes: z.infer<typeof ChartNoteSchema>[]; grids: Record<string, Grid>;
  verifiedAt?: string | null; // N4: the day the student checked the part by ear (changed notes clear it)
};
export type YtResult = { id: string; title: string; channel: string; thumbnail: string; durationSec: number };
