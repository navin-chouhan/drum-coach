import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'dc-stt-'));
process.env.DATA_DIR = dir;
// A fake "uv" that behaves like whisper_helper.py: ready, then "transcribes" by reading the file's text.
const fake = join(dir, 'fake-uv');
writeFileSync(fake, `#!/usr/bin/env node
if (process.argv[2] === '--version') { console.log('uv 0.0.0 (fake)'); process.exit(0); }
const fs = require('fs'), rl = require('readline').createInterface({ input: process.stdin });
console.log(JSON.stringify({ ready: true }));
rl.on('line', l => { const r = JSON.parse(l); const t = fs.readFileSync(r.path, 'utf8');
  console.log(JSON.stringify(t === 'bad' ? { id: r.id, ok: false, error: 'cannot decode' } : { id: r.id, ok: true, text: t })); });
`);
chmodSync(fake, 0o755);
process.env.UV_BIN = fake;
const { transcribe, sttStatus, stopStt } = await import('./stt');
afterAll(stopStt);

describe('speech to text', () => {
  it('transcribes through one long-running helper and deletes the audio afterwards', async () => {
    const [a, b] = await Promise.all([transcribe(Buffer.from('why does my kick rush')), transcribe(Buffer.from('slower please'))]);
    expect([a, b]).toEqual(['why does my kick rush', 'slower please']);
    expect(sttStatus()).toMatchObject({ available: true, loaded: true });
    expect(readFileSync).toBeDefined();
    expect(existsSync(join(tmpdir(), `drum-coach-q-${process.pid}-1.wav`))).toBe(false);
  });
  it('reports a bad recording and keeps working', async () => {
    await expect(transcribe(Buffer.from('bad'))).rejects.toThrow('cannot decode');
    expect(await transcribe(Buffer.from('again'))).toBe('again');
  });
});
