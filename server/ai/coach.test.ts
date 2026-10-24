import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claudeCliProvider } from './providers';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'dc-test-'));
const { extractJson, ask, setProvider } = await import('./coach');
const { NextSchema } = await import('../../src/coach/schemas');

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
    expect((await ask('next', NextSchema, { x: 1 })).cached).toBe(false);
    expect(await ask('next', NextSchema, { x: 1 })).toMatchObject({ cached: true, data: { bpm: 85 } });
    expect(calls).toBe(1);
  });
  it('rejects answers in the wrong shape', async () => {
    setProvider({ name: 'fake2', complete: async () => '{"chartId":"x"}' });
    await expect(ask('next', NextSchema, { y: 2 })).rejects.toMatchObject({ code: 'failed' });
  });
});
