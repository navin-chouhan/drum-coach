// The Anthropic Messages API over plain fetch, for the coach's API-key fallback (D2: the home server first; with an
// optional key in the iPad's Keychain, the iPad asks Claude itself when the server can't be reached). No SDK package.
// The request is the server's anthropicApiProvider's (server/ai/providers.ts): the model, max_tokens, the system prompt,
// one user message, and the server-side refusal fallback. The key goes only into the x-api-key header of a request
// to api.anthropic.com: never logged, never in an error message, never sent anywhere else.

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2026-10-21';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** CLAUDE.md: CLAUDE_MODEL defaults to claude-sonnet-5-5. */
export const DEFAULT_COACH_MODEL = 'claude-sonnet-5-5';
/** The server's TIMEOUT_MS. */
export const DIRECT_TIMEOUT_MS = 180_000;

export type ApiMessage = { role: 'user' | 'assistant'; content: string };
export type DirectFailureKind = 'network' | 'timeout' | 'auth' | 'rate-limited' | 'refused' | 'failed';
export type DirectResult = { ok: true; text: string } | { ok: false; kind: DirectFailureKind; message: string };

export type FetchLike = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type AnthropicDeps = {
  fetch: FetchLike;
  /** The key from the Keychain (null: none). Read per call, so a removed key stops the fallback at once. */
  key(): Promise<string | null>;
  /** The model setting (Setup → Coach · fallback), default DEFAULT_COACH_MODEL. */
  model(): string;
  timeoutMs?: number;
};

type Reply = { content?: { type?: string; text?: string }[]; stop_reason?: string; error?: { type?: string; message?: string } };

/** The server's messages for each failure (providers.ts anthropicApiProvider), worded for the iPad. */
function failureFor(status: number, body: Reply | undefined): DirectResult {
  const msg = typeof body?.error?.message === 'string' ? body.error.message.slice(0, 200) : '';
  if (status === 401 || status === 403) return { ok: false, kind: 'auth', message: 'The Anthropic API key in Setup → Coach · fallback was rejected.' };
  if (status === 429) return { ok: false, kind: 'rate-limited', message: 'Rate limited by the API; try again in a minute.' };
  return { ok: false, kind: 'failed', message: `API error ${status}${msg ? `: ${msg}` : ''}` };
}

export function createAnthropicClient(deps: AnthropicDeps) {
  return {
    /**
     * One call: the system prompt and the conversation so far (the last message is the user's). `fallbacks`: the
     * server-side refusal fallback, as the server's ask() sends it; the live session sends none, as its ApiSession.
     */
    async complete(system: string, messages: ApiMessage[], maxTokens = 16000, opts: { fallbacks?: boolean } = {}): Promise<DirectResult> {
      const fallbacks = opts.fallbacks ?? true;
      const key = await deps.key().catch(() => null);
      if (!key) return { ok: false, kind: 'auth', message: 'No Anthropic API key is set.' };
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), deps.timeoutMs ?? DIRECT_TIMEOUT_MS);
      try {
        const res = await deps.fetch(ANTHROPIC_URL, {
          method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION, ...(fallbacks && { 'anthropic-beta': FALLBACK_BETA }) },
          body: JSON.stringify({ model: deps.model() || DEFAULT_COACH_MODEL, max_tokens: maxTokens, system, messages, ...(fallbacks && { fallbacks: 'default' }) }),
        });
        let body: Reply | undefined;
        try { body = await res.json() as Reply; } catch { body = undefined; }
        if (!res.ok) return failureFor(res.status, body);
        if (body?.stop_reason === 'refusal') return { ok: false, kind: 'refused', message: 'The coach declined to answer that.' };
        const text = (body?.content ?? []).flatMap(b => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('');
        return text ? { ok: true, text } : { ok: false, kind: 'failed', message: 'The API sent an empty answer.' };
      } catch {
        // Never the error's own text: it could echo the request.
        return ctl.signal.aborted
          ? { ok: false, kind: 'timeout', message: 'The coach took too long to answer.' }
          : { ok: false, kind: 'network', message: 'Couldn’t reach the Anthropic API either (is the iPad online?).' };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
export type AnthropicClient = ReturnType<typeof createAnthropicClient>;
