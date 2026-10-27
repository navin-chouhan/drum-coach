import Anthropic from '@anthropic-ai/sdk';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { CoachReplySchema, type CoachReply } from '../../src/coach/schemas.ts';
import { extractJson } from './coach.ts';
import { AiError } from './providers.ts';
import { childEnv } from '../guard.ts';

// The live coaching conversation: ONE long-running `claude` process per practice session, so the coach remembers
// every take and question, and answers stream back (no start-up per call). Restarts after IDLE or MAX_TURNS.
const IDLE_MS = 30 * 60_000, MAX_TURNS = 40;
const SYSTEM = () => readFileSync(join(import.meta.dirname, '..', 'prompts', 'session.md'), 'utf8');

type Turn = { text: string; onSay: (sentence: string) => void; resolve: (r: CoachReply) => void; reject: (e: Error) => void };

/** Streams "say" sentence by sentence while the JSON reply is still being written. */
export function sayStreamer(onSay: (s: string) => void) {
  let spoken = 0;
  return (soFar: string, final = false) => {
    const m = soFar.match(/"say"\s*:\s*"((?:[^"\\]|\\.)*)("?)/);
    if (!m) return;
    const text = m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    const done = m[2] === '"' || final;
    const end = done ? text.length : Math.max(text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? ')) + 1;
    if (end > spoken) { const s = text.slice(spoken, end).trim(); if (s) onSay(s); spoken = end; }
  };
}

class CliSession {
  private proc: ChildProcessWithoutNullStreams;
  private cwd = mkdtempSync(join(tmpdir(), 'drum-coach-session-'));
  private queue: Turn[] = [];
  private current: (Turn & { text: string; acc: string; stream: ReturnType<typeof sayStreamer> }) | null = null;
  turns = 0; lastUsed = Date.now(); dead = false;

  constructor(bin = process.env.CLAUDE_BIN || 'claude') {
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
      '--tools', '', '--safe-mode', '--no-session-persistence', '--system-prompt', SYSTEM()];
    if (process.env.CLAUDE_CLI_MODEL) args.push('--model', process.env.CLAUDE_CLI_MODEL);
    if (process.env.CLAUDE_CLI_EFFORT) args.push('--effort', process.env.CLAUDE_CLI_EFFORT);
    this.proc = spawn(bin, args, { cwd: this.cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] }); // the subscription, not an API key
    this.proc.stderr.resume();
    createInterface({ input: this.proc.stdout }).on('line', line => this.onLine(line));
    const fail = (why: string) => {
      this.dead = true;
      rmSync(this.cwd, { recursive: true, force: true });
      const err = new AiError(/ENOENT/.test(why) ? 'missing' : 'failed', /ENOENT/.test(why) ? 'The claude CLI was not found.' : why);
      [this.current, ...this.queue].forEach(t => t?.reject(err));
      this.current = null; this.queue = [];
    };
    this.proc.on('error', e => fail(e.message));
    this.proc.on('exit', code => fail(`the coach session ended (${code})`));
  }

  private onLine(line: string) {
    let m: { type?: string; event?: { type?: string; delta?: { type?: string; text?: string } }; result?: string; is_error?: boolean };
    try { m = JSON.parse(line); } catch { return; }
    const t = this.current;
    if (!t) return;
    if (m.type === 'stream_event' && m.event?.type === 'content_block_delta' && m.event.delta?.type === 'text_delta') {
      t.acc += m.event.delta.text ?? '';
      t.stream(t.acc);
    } else if (m.type === 'result') {
      this.current = null;
      const text = m.result ?? t.acc;
      try {
        if (m.is_error) throw new AiError(/log ?in|auth/i.test(text) ? 'auth' : 'failed', text.slice(0, 300));
        t.stream(text, true);
        const r = CoachReplySchema.safeParse(extractJson(text));
        if (!r.success) throw new AiError('failed', "The coach's answer didn't match the expected format.");
        t.resolve(r.data);
      } catch (e) { t.reject(e as Error); }
      this.next();
    }
  }

  private next() {
    if (this.current || !this.queue.length || this.dead) return;
    const t = this.queue.shift()!;
    this.current = { ...t, acc: '', stream: sayStreamer(t.onSay) };
    this.turns++; this.lastUsed = Date.now();
    this.proc.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: t.text } })}\n`);
  }

  send(text: string, onSay: (s: string) => void) {
    return new Promise<CoachReply>((resolve, reject) => { this.queue.push({ text, onSay, resolve, reject }); this.next(); });
  }
  close() { this.dead = true; this.proc.kill(); rmSync(this.cwd, { recursive: true, force: true }); }
}

/** API-key fallback: same conversation, kept in memory and re-sent each turn (no streaming). */
class ApiSession {
  private client = new Anthropic({ timeout: 120_000 });
  private messages: Anthropic.MessageParam[] = [];
  turns = 0; lastUsed = Date.now(); dead = false;
  async send(text: string, onSay: (s: string) => void) {
    this.turns++; this.lastUsed = Date.now();
    this.messages.push({ role: 'user', content: text });
    const res = await this.client.messages.create({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: 2000, system: SYSTEM(), messages: this.messages });
    const out = res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
    this.messages.push({ role: 'assistant', content: out });
    const r = CoachReplySchema.safeParse(extractJson(out));
    if (!r.success) throw new AiError('failed', "The coach's answer didn't match the expected format.");
    onSay(r.data.say);
    return r.data;
  }
  close() { this.dead = true; }
}

let session: CliSession | ApiSession | null = null;

/** Sends one event to the live coach; `onSay` gets each spoken sentence as soon as it's written. */
export function coachTurn(event: unknown, onSay: (s: string) => void): Promise<CoachReply> {
  if (session && (session.dead || session.turns >= MAX_TURNS || Date.now() - session.lastUsed > IDLE_MS)) { session.close(); session = null; }
  session ??= process.env.AI_PROVIDER === 'api' && process.env.ANTHROPIC_API_KEY ? new ApiSession() : new CliSession();
  return session.send(JSON.stringify(event), onSay);
}
export const endCoachSession = () => { session?.close(); session = null; };
