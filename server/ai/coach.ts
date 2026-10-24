import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { db } from '../db.ts';
import { AiError, pickProvider, type AiProvider } from './providers.ts';

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

// One call at a time: calls are slow and count toward the subscription's usage limits.
let queue: Promise<unknown> = Promise.resolve();

export async function ask<T>(kind: 'feedback' | 'next' | 'plan' | 'chat', schema: z.ZodType<T>, input: unknown): Promise<{ data: T; cached: boolean }> {
  const system = `${prompt('system')}\n\n${prompt(kind)}`;
  const user = JSON.stringify(input);
  const key = createHash('sha256').update(`${provider.name}\0${system}\0${user}`).digest('hex');
  const hit = db.prepare('SELECT response FROM ai_cache WHERE key = ?').get(key) as { response: string } | undefined;
  if (hit) return { data: schema.parse(JSON.parse(hit.response)), cached: true };

  const call = queue.then(() => provider.complete(system, user));
  queue = call.catch(() => {});
  const parsed = schema.safeParse(extractJson(await call));
  if (!parsed.success) throw new AiError('failed', `The coach's answer didn't match the expected format (${parsed.error.issues[0]?.path.join('.')}: ${parsed.error.issues[0]?.message}).`);
  db.prepare('INSERT OR REPLACE INTO ai_cache (key, kind, response) VALUES (?, ?, ?)').run(key, kind, JSON.stringify(parsed.data));
  return { data: parsed.data, cached: false };
}
