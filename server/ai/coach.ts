import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { db } from '../db.ts';
import { AiError, pickProvider, type AiProvider, type ModelChoice } from './providers.ts';

const PROMPTS = join(import.meta.dirname, '..', 'prompts');
const prompt = (name: string) => readFileSync(join(PROMPTS, `${name}.md`), 'utf8');

let provider: AiProvider = pickProvider();
export const getProvider = () => provider;
export const setProvider = (p: AiProvider) => { provider = p; }; // for tests

/** Pulls the JSON object out of a reply, tolerating code fences or stray text around it. */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new AiError('failed', 'The coach did not answer with JSON.');
  try { return JSON.parse(text.slice(start, end + 1)); } catch { throw new AiError('failed', 'The coach answered with broken JSON.'); }
}

// At most two calls at once: a question shouldn't wait behind a briefing, but calls count toward usage limits.
const MAX_PARALLEL = 2;
let running = 0;
const waiters: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>(r => waiters.push(r));
  running++;
  try { return await fn(); } finally { running--; waiters.shift()?.(); }
}

/**
 * Lessons, plans, show-off picks and song grooves are written in the background, so they get a stronger model
 * (CLAUDE_CLI_LESSON_MODEL / CLAUDE_CLI_LESSON_EFFORT); the live chat and quick answers keep the fast global one.
 */
export const LESSON_KINDS = ['lesson', 'plan', 'showoff', 'groove', 'month'] as const;
export const lessonModel = (): ModelChoice => ({ model: process.env.CLAUDE_CLI_LESSON_MODEL || 'claude-sonnet-5-5', effort: process.env.CLAUDE_CLI_LESSON_EFFORT || 'medium' });

/** `noCache`: ask again (a wrong answer would otherwise come back from the cache forever); the new one replaces it. */
export async function ask<T>(kind: 'feedback' | 'plan' | 'groove' | 'lesson' | 'tips' | 'showoff' | 'month', schema: z.ZodType<T>, input: unknown, opts: { noCache?: boolean } = {}): Promise<{ data: T; cached: boolean }> {
  const system = `${prompt('system')}\n\n${prompt(kind)}`;
  const user = JSON.stringify(input);
  const choice = (LESSON_KINDS as readonly string[]).includes(kind) ? lessonModel() : undefined;
  // (the fast tasks keep their old key, so their cached answers stay valid)
  const key = createHash('sha256').update([provider.name, ...(choice ? [`${choice.model}:${choice.effort}`] : []), system, user].join('\0')).digest('hex');
  const hit = opts.noCache ? undefined : db.prepare('SELECT response FROM ai_cache WHERE key = ?').get(key) as { response: string } | undefined;
  if (hit) return { data: schema.parse(JSON.parse(hit.response)), cached: true };

  const call = limited(() => provider.complete(system, user, choice));
  const parsed = schema.safeParse(extractJson(await call));
  if (!parsed.success) throw new AiError('failed', `The coach's answer didn't match the expected format (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}).`);
  db.prepare('INSERT OR REPLACE INTO ai_cache (key, kind, response) VALUES (?, ?, ?)').run(key, kind, JSON.stringify(parsed.data));
  return { data: parsed.data, cached: false };
}
