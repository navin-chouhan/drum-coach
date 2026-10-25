import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeCliProvider } from './providers';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'dc-test-'));
const { extractJson, ask, setProvider } = await import('./coach');
const { z } = await import('zod');
const Answer = z.object({ chartId: z.string(), bpm: z.number(), reason: z.string() });

const dir = mkdtempSync(join(tmpdir(), 'fake-claude-'));
function fake(name: string, body: string) {
  const p = join(dir, name);
  writeFileSync(p, `#!/bin/sh\ncat > /dev/null\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

describe('claude CLI provider', () => {
  it('returns the result, runs in an empty dir and never sees the API key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-secret';
    const bin = fake('ok', `echo "{\\"result\\":\\"files=$(ls -A | wc -l) key=\${ANTHROPIC_API_KEY:-none} tools=$5\\",\\"is_error\\":false}"`);
    expect(await claudeCliProvider(bin).complete('sys', 'hi')).toBe('files=0 key=none tools=');
    delete process.env.ANTHROPIC_API_KEY;
  });
  it('maps a logged-out CLI to an auth error', async () => {
    const bin = fake('auth', `echo '{"result":"Not logged in · Please run /login","is_error":true}'; exit 1`);
    await expect(claudeCliProvider(bin).complete('s', 'p')).rejects.toMatchObject({ code: 'auth' });
  });
  it('a task can ask for its own model and effort', async () => {
    const bin = fake('args', `echo "{\\"result\\":\\"$*\\",\\"is_error\\":false}"`);
    expect(await claudeCliProvider(bin).complete('s', 'p', { model: 'claude-sonnet-5-5', effort: 'medium' })).toMatch(/--model claude-sonnet-5-5 --effort medium/);
  });
  it('reports a missing CLI clearly', async () => {
    await expect(claudeCliProvider(join(dir, 'nope')).complete('s', 'p')).rejects.toMatchObject({ code: 'missing' });
  });
});

describe('coach', () => {
  it('extracts JSON from fenced or chatty answers', () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson('no json here')).toThrow();
  });
  it('validates, then serves repeats from the cache', async () => {
    let calls = 0;
    setProvider({ name: 'fake', complete: async () => { calls++; return '{"chartId":"rock-8ths","bpm":85,"reason":"go"}'; } });
    expect((await ask('feedback', Answer, { x: 1 })).cached).toBe(false);
    expect(await ask('feedback', Answer, { x: 1 })).toMatchObject({ cached: true, data: { bpm: 85 } });
    expect(calls).toBe(1);
  });
  it('lessons, plans, show-off picks and grooves are written by the stronger model; the model is in the cache key', async () => {
    const seen: unknown[] = [];
    setProvider({ name: 'fake3', complete: async (_s, _p, o) => { seen.push(o); return '{"chartId":"x","bpm":80,"reason":"r"}'; } });
    await ask('lesson', Answer, { z: 1 });
    await ask('feedback', Answer, { z: 1 });
    expect(seen).toEqual([{ model: 'claude-sonnet-5-5', effort: 'medium' }, undefined]);
    process.env.CLAUDE_CLI_LESSON_MODEL = 'claude-opus-5-5';
    expect((await ask('lesson', Answer, { z: 1 })).cached).toBe(false); // another model: not the cached answer
    expect(seen[2]).toEqual({ model: 'claude-opus-5-5', effort: 'medium' });
    delete process.env.CLAUDE_CLI_LESSON_MODEL;
  });
  it('rejects answers in the wrong shape', async () => {
    setProvider({ name: 'fake2', complete: async () => '{"chartId":"x"}' });
    await expect(ask('feedback', Answer, { y: 2 })).rejects.toMatchObject({ code: 'failed' });
  });
});
