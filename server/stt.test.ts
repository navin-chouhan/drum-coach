import { chmodSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
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
const mode = p => (fs.statSync(p).mode & 0o777).toString(8);
rl.on('line', l => { const r = JSON.parse(l); let t = fs.readFileSync(r.path, 'utf8');
  if (t === 'mode?') t = mode(r.path) + ' ' + mode(require('path').dirname(r.path)); // who could read the recording
  if (t === 'env?') t = ['ANTHROPIC_API_KEY', 'YOUTUBE_API_KEY'].filter(k => process.env[k]).join(' ') || 'no keys';
  console.log(JSON.stringify(t === 'bad' ? { id: r.id, ok: false, error: 'cannot decode' } : { id: r.id, ok: true, text: t })); });
`);
chmodSync(fake, 0o755);
process.env.UV_BIN = fake;
process.env.ANTHROPIC_API_KEY = 'sk-ant-test'; process.env.YOUTUBE_API_KEY = 'AIza-test';
const { transcribe, sttStatus, stopStt, fixCounts } = await import('./stt');
afterAll(stopStt);

describe('speech to text', () => {
  it('transcribes through one long-running helper and deletes the audio afterwards', async () => {
    const [a, b] = await Promise.all([transcribe(Buffer.from('why does my kick rush')), transcribe(Buffer.from('slower please'))]);
    expect([a, b]).toEqual(['why does my kick rush', 'slower please']);
    expect(sttStatus()).toMatchObject({ available: true, loaded: true });
    expect(readdirSync(tmpdir()).filter(n => n.startsWith('drum-coach-q-'))).toEqual([]);
  });
  it('keeps the recording private while it is transcribed, and the API keys away from the helper', async () => {
    expect(await transcribe(Buffer.from('mode?'))).toBe('600 700');
    expect(await transcribe(Buffer.from('env?'))).toBe('no keys');
  });
  it('reports a bad recording and keeps working', async () => {
    await expect(transcribe(Buffer.from('bad'))).rejects.toThrow('cannot decode');
    expect(await transcribe(Buffer.from('again'))).toBe('again');
  });
  it('turns a misheard "end of three" back into the count', async () => {
    expect(await transcribe(Buffer.from('Am I rushing the hi-hat on the end of three?'))).toBe('Am I rushing the hi-hat on the and of three?');
    expect(fixCounts('End of 2 is late')).toBe('And of 2 is late');
    expect(fixCounts('the end of one and the end of four')).toBe('the and of one and the and of four');
    expect(fixCounts('at the end of four bars, and the end of three times')).toBe('at the end of four bars, and the end of three times');
    expect(fixCounts('the end of the song, the end of fourteen')).toBe('the end of the song, the end of fourteen');
  });
});
