import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import { DATA_DIR } from './db.ts';
import { childEnv } from './guard.ts';

// Offline voice for the coach: Piper (https://github.com/OHF-Voice/piper1-gpl), installed with `uv tool install piper-tts`,
// voice files in data/voices/. Rendered phrases are cached as WAV in data/tts/.
const VOICES = join(DATA_DIR, 'voices'), CACHE = join(DATA_DIR, 'tts');

/** Piper's Python (from the `piper` launcher's shebang, or PIPER_PYTHON) and the first voice model found. */
export function findPiper(): { python: string; model: string } | null {
  const model = process.env.PIPER_VOICE || (existsSync(VOICES) ? readdirSync(VOICES).filter(f => f.endsWith('.onnx')).sort().map(f => join(VOICES, f))[0] : undefined);
  let python = process.env.PIPER_PYTHON;
  if (!python) {
    const which = spawnSync('which', ['piper'], { encoding: 'utf8' });
    const launcher = which.status === 0 ? which.stdout.trim() : '';
    const shebang = launcher ? readFileSync(launcher, 'utf8').split('\n')[0] : '';
    python = shebang.startsWith('#!') ? shebang.slice(2).trim() : undefined;
  }
  return python && model && existsSync(model) ? { python, model } : null;
}

let helper: { proc: ChildProcessWithoutNullStreams; ready: Promise<void>; waiting: Map<number, (e?: string) => void> } | null = null;
let nextId = 1;

function startHelper(p: { python: string; model: string }) {
  const proc = spawn(p.python, [join(import.meta.dirname, 'piper_helper.py'), p.model], { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map<number, (e?: string) => void>();
  let readyFn!: () => void, failFn!: (e: Error) => void;
  const ready = new Promise<void>((res, rej) => { readyFn = res; failFn = rej; });
  createInterface({ input: proc.stdout }).on('line', line => {
    let m: { ready?: boolean; id?: number; ok?: boolean; error?: string };
    try { m = JSON.parse(line); } catch { return; }
    if (m.ready) return readyFn();
    const done = m.id !== undefined ? waiting.get(m.id) : undefined;
    if (done) { waiting.delete(m.id!); done(m.ok ? undefined : m.error ?? 'failed'); }
  });
  proc.stderr.resume(); // Piper logs to stderr
  const fail = (why: string) => { failFn(new Error(why)); waiting.forEach(d => d(why)); waiting.clear(); if (helper?.proc === proc) helper = null; };
  proc.on('error', e => fail(e.message));
  proc.on('exit', code => fail(`piper helper exited (${code})`));
  return { proc, ready, waiting };
}

/** Path of the WAV for `text`, rendering it if it isn't cached yet. Throws if Piper isn't set up. */
export async function speech(text: string): Promise<string> {
  const p = findPiper();
  if (!p) throw new Error('Piper is not set up (uv tool install piper-tts, and a voice in data/voices).');
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${createHash('sha1').update(`${basename(p.model)}\0slow1.3\0${text}`).digest('hex')}.wav`);
  if (existsSync(file)) return file;
  helper ??= startHelper(p);
  const h = helper;
  await h.ready;
  const id = nextId++, tmp = `${file}.${id}.tmp`;
  await new Promise<void>((resolve, reject) => {
    h.waiting.set(id, e => (e ? reject(new Error(e)) : resolve()));
    h.proc.stdin.write(`${JSON.stringify({ id, text, out: tmp })}\n`);
  });
  renameSync(tmp, file); // atomic: a half-written file is never served
  return file;
}

export const ttsStatus = () => {
  const p = findPiper();
  return p ? { engine: 'piper' as const, voice: basename(p.model, '.onnx') } : { engine: null, voice: null };
};
export const stopTts = () => { helper?.proc.kill(); helper = null; };
