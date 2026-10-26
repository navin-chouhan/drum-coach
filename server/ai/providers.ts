import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A task's own model and effort (lesson writing uses a stronger model than the live chat). */
export type ModelChoice = { model: string; effort: string };
export interface AiProvider {
  name: string;
  /** Returns the model's text answer. Throws AiError. */
  complete(system: string, prompt: string, choice?: ModelChoice): Promise<string>;
}

export type AiErrorCode = 'missing' | 'auth' | 'timeout' | 'refused' | 'failed';
export class AiError extends Error {
  code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) { super(message); this.code = code; }
}

const TIMEOUT_MS = 180_000;

/**
 * Default: the logged-in Claude Code CLI (your subscription). No tools, safe mode (no CLAUDE.md, hooks,
 * plugins or MCP), no saved session, and an empty temp dir as cwd — it can only answer.
 */
export function claudeCliProvider(bin = process.env.CLAUDE_BIN || 'claude'): AiProvider {
  return {
    // the model and effort are part of the name, so cached answers from another model aren't reused
    name: `claude-cli:${process.env.CLAUDE_CLI_MODEL || 'default'}:${process.env.CLAUDE_CLI_EFFORT || 'default'}`,
    complete: (system, prompt, choice) => new Promise((resolve, reject) => {
      const cwd = mkdtempSync(join(tmpdir(), 'drum-coach-'));
      const args = ['-p', '--output-format', 'json', '--tools', '', '--safe-mode', '--no-session-persistence', '--max-turns', '1', '--system-prompt', system];
      const model = choice?.model || process.env.CLAUDE_CLI_MODEL, effort = choice?.effort || process.env.CLAUDE_CLI_EFFORT;
      if (model) args.push('--model', model);
      if (effort) args.push('--effort', effort); // low = less thinking, faster answers
      // Never hand the CLI an API key: it would bill the key instead of the subscription.
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      const child = spawn(bin, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', err = '', settled = false;
      const done = (e?: AiError, text?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        rmSync(cwd, { recursive: true, force: true });
        if (e) reject(e); else resolve(text!);
      };
      const timer = setTimeout(() => { child.kill('SIGTERM'); done(new AiError('timeout', 'The coach took too long to answer.')); }, TIMEOUT_MS);
      child.stdout.on('data', d => { out += d; });
      child.stderr.on('data', d => { err += d; });
      child.on('error', (e: NodeJS.ErrnoException) => done(e.code === 'ENOENT'
        ? new AiError('missing', 'The claude CLI was not found. Install Claude Code and run `claude` once to log in.')
        : new AiError('failed', e.message)));
      child.on('close', code => {
        let parsed: { result?: string; is_error?: boolean } | undefined;
        try { parsed = JSON.parse(out); } catch { /* not JSON */ }
        const text = parsed?.result ?? '';
        if (code === 0 && parsed && !parsed.is_error && text) return done(undefined, text);
        const msg = (text || err || out || `claude exited with code ${code}`).trim().slice(0, 300);
        if (/log ?in|logged out|auth|credential|api key|subscription/i.test(msg)) return done(new AiError('auth', `Claude Code isn't logged in: ${msg}. Run \`claude\` in a terminal and log in.`));
        done(new AiError('failed', msg));
      });
      child.stdin.end(prompt);
    }),
  };
}

/** Optional fallback when ANTHROPIC_API_KEY is set. */
export function anthropicApiProvider(model = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5'): AiProvider {
  const client = new Anthropic({ timeout: TIMEOUT_MS });
  return {
    name: 'anthropic-api',
    async complete(system, prompt) {
      try {
        const res = await client.beta.messages.create({
          model, max_tokens: 16000, system,
          messages: [{ role: 'user', content: prompt }],
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        } as Anthropic.Beta.MessageCreateParamsNonStreaming);
        if (res.stop_reason === 'refusal') throw new AiError('refused', 'The coach declined to answer that.');
        return res.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('');
      } catch (e) {
        if (e instanceof AiError) throw e;
        if (e instanceof Anthropic.AuthenticationError) throw new AiError('auth', 'The Anthropic API key in .env was rejected.');
        if (e instanceof Anthropic.RateLimitError) throw new AiError('failed', 'Rate limited by the API; try again in a minute.');
        if (e instanceof Anthropic.APIError) throw new AiError('failed', `API error ${e.status}: ${e.message}`);
        throw new AiError('failed', String(e));
      }
    },
  };
}

export function pickProvider(): AiProvider {
  return process.env.AI_PROVIDER === 'api' && process.env.ANTHROPIC_API_KEY ? anthropicApiProvider() : claudeCliProvider();
}
