import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DATA_DIR } from './db.ts';

// Talk to the coach: offline speech-to-text with faster-whisper, run through `uv` (no global install needed;
// the first start downloads the package and the model into uv's cache and data/whisper). Audio is deleted after use.
const MODEL = () => process.env.WHISPER_MODEL || 'base.en';

export function findUv(): string | null {
  for (const bin of [process.env.UV_BIN, 'uv', join(homedir(), '.local', 'bin', 'uv')]) {
    if (bin && spawnSync(bin, ['--version'], { timeout: 5000 }).status === 0) return bin;
  }
  return null;
}

let helper: { proc: ChildProcessWithoutNullStreams; ready: Promise<void>; waiting: Map<number, (r: { text?: string; error?: string }) => void> } | null = null;
let nextId = 1, loaded = false;

function startHelper(uv: string) {
  const root = join(DATA_DIR, 'whisper');
  mkdirSync(root, { recursive: true });
  const args = process.env.UV_BIN?.includes('fake') ? [] : ['run', '--quiet', '--with', 'faster-whisper', 'python'];
  const proc = spawn(uv, [...args, join(import.meta.dirname, 'whisper_helper.py'), MODEL(), root], { stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map<number, (r: { text?: string; error?: string }) => void>();
  let readyFn!: () => void, failFn!: (e: Error) => void;
  const ready = new Promise<void>((res, rej) => { readyFn = res; failFn = rej; });
  createInterface({ input: proc.stdout }).on('line', line => {
    let m: { ready?: boolean; id?: number; ok?: boolean; text?: string; error?: string };
    try { m = JSON.parse(line); } catch { return; }
    if (m.ready) { loaded = true; return readyFn(); }
    const done = m.id !== undefined ? waiting.get(m.id) : undefined;
    if (done) { waiting.delete(m.id!); done(m.ok ? { text: m.text ?? '' } : { error: m.error ?? 'failed' }); }
  });
  proc.stderr.resume();
  const fail = (why: string) => { failFn(new Error(why)); waiting.forEach(d => d({ error: why })); waiting.clear(); loaded = false; if (helper?.proc === proc) helper = null; };
  proc.on('error', e => fail(e.message));
  proc.on('exit', code => fail(`speech helper exited (${code})`));
  return { proc, ready, waiting };
}

// base.en hears the count "and of three" as "end of three" (the larger models fix it but cost 3x the time and
// memory on this laptop); "the end of four bars" is left alone
export const fixCounts = (text: string) =>
  text.replace(/\b([Ee])nd of (one|two|three|four|[1-4])\b(?!\s+(?:bars?|measures?|beats?|counts?|times|minutes?|seconds?)\b)/g,
    (_, e: string, n: string) => `${e === 'E' ? 'A' : 'a'}nd of ${n}`);

/** Transcribes one recording: 16-bit PCM WAV (the browser sends 16 kHz mono). */
export async function transcribe(audio: Buffer): Promise<string> {
  const uv = findUv();
  if (!uv) throw new Error('Talking to the coach needs uv (https://docs.astral.sh/uv/) for the offline speech model.');
  helper ??= startHelper(uv);
  const h = helper;
  await h.ready;
  const id = nextId++, file = join(tmpdir(), `drum-coach-q-${process.pid}-${id}.wav`);
  writeFileSync(file, audio);
  try {
    const r = await new Promise<{ text?: string; error?: string }>(resolve => {
      h.waiting.set(id, resolve);
      h.proc.stdin.write(`${JSON.stringify({ id, path: file })}\n`);
    });
    if (r.error !== undefined) throw new Error(r.error);
    return fixCounts(r.text!);
  } finally { rmSync(file, { force: true }); }
}

export const sttStatus = () => ({ available: !!findUv(), loaded, model: MODEL() });
export const stopStt = () => { helper?.proc.kill(); helper = null; loaded = false; };
