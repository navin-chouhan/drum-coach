// The two coach calls Songs makes (the web's askCoach from LearnMode and JamMode): the groove of a real song
// (POST /api/coach/groove: the coach knows songs, it can't hear the recording) and feedback on a jam
// (POST /api/coach/feedback, with the iPad's coach context, B22). Answers are validated with the core's zod schemas
// and cached per key for the session, as the web caches coach entries; "Ask again" skips the cache.
import { FeedbackSchema, GrooveSchema } from '@drum-coach/core/coach/schemas';
import type { z } from 'zod';
import type { ApiFailure, HomeServer } from '../../platform/contracts';
import { songsFailureText } from './songsApi';

export type Groove = z.infer<typeof GrooveSchema>;
export type Feedback = z.infer<typeof FeedbackSchema>;
export type CoachEntry<T> = { status: 'thinking' } | { status: 'done'; data: T } | { status: 'error'; error: string };

const cache = new Map<string, CoachEntry<unknown>>();
const listeners = new Set<() => void>();
const set = (key: string, e: CoachEntry<unknown>) => { cache.set(key, e); listeners.forEach(l => l()); };
export const coachEntry = <T>(key: string) => cache.get(key) as CoachEntry<T> | undefined;
export const onCoachEntries = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

async function ask<T>(key: string, run: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, schema: z.ZodType<T>, again: boolean) {
  const had = cache.get(key);
  if (!again && (had?.status === 'done' || had?.status === 'thinking')) return;
  set(key, { status: 'thinking' });
  const r = await run();
  if (!r.ok) { set(key, { status: 'error', error: r.error }); return; }
  const p = schema.safeParse(r.data);
  set(key, p.success ? { status: 'done', data: p.data } : { status: 'error', error: "The coach's answer didn't make sense. Ask again." });
}

/** A failed coach call, in words (everything else in Songs keeps working). */
export function coachFailureText(f: ApiFailure): string {
  if (f.reason === 'not-configured') return 'The coach needs the home server: add it in Setup → Coach.';
  if (f.reason === 'unreachable') return "Can't reach the home server, so the coach is offline. Everything else keeps working.";
  return songsFailureText(f);
}

const call = (server: HomeServer, path: `/api/${string}`, body: unknown) => async () => {
  const r = await server.call<unknown>('POST', path, body);
  return r.ok ? { ok: true as const, data: r.data } : { ok: false as const, error: coachFailureText(r) };
};

export const askGroove = (server: HomeServer, key: string, body: object, again = false) =>
  ask(key, call(server, '/api/coach/groove', body), GrooveSchema, again);

export const askFeedback = (server: HomeServer, key: string, summary: Record<string, unknown>, context: () => Promise<unknown>) =>
  ask(key, async () => call(server, '/api/coach/feedback', { summary, context: await context() })(), FeedbackSchema, false);

export const COACH_CANT_HEAR = "The coach can't hear the recording: treat this as a starting point and check it by ear.";
