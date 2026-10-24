import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'dc-tts-'));
process.env.DATA_DIR = dir;
mkdirSync(join(dir, 'voices'));
writeFileSync(join(dir, 'voices', 'test-voice.onnx'), 'model');
// A fake "python" that behaves like piper_helper.py: ready, then writes the text into the out file.
const fake = join(dir, 'fake-python');
writeFileSync(fake, `#!/usr/bin/env node
const rl = require('readline').createInterface({ input: process.stdin });
console.log(JSON.stringify({ ready: true }));
rl.on('line', l => { const r = JSON.parse(l); if (r.text === 'boom') return console.log(JSON.stringify({ id: r.id, ok: false, error: 'bad text' }));
  require('fs').writeFileSync(r.out, 'WAV:' + r.text); console.log(JSON.stringify({ id: r.id, ok: true })); });
`);
chmodSync(fake, 0o755);
process.env.PIPER_PYTHON = fake;
const { speech, stopTts, ttsStatus } = await import('./tts');
afterAll(stopTts);

describe('tts', () => {
  it('finds the voice and renders through one long-running helper, cached by text', async () => {
    expect(ttsStatus()).toEqual({ engine: 'piper', voice: 'test-voice' });
    const [a, b] = await Promise.all([speech('One'), speech('Dragging. Push')]);
    expect(readFileSync(a, 'utf8')).toBe('WAV:One');
    expect(readFileSync(b, 'utf8')).toBe('WAV:Dragging. Push');
    expect(await speech('One')).toBe(a); // cached
  });
  it('reports helper errors without breaking later requests', async () => {
    await expect(speech('boom')).rejects.toThrow('bad text');
    expect(readFileSync(await speech('Two'), 'utf8')).toBe('WAV:Two');
  });
});
