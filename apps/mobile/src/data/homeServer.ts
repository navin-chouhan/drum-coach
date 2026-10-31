// HomeServer (contracts.ts), the pure part: the client for the owner's home server (D2, docs/mobile/HOME-SERVER.md).
// The URL is in the key-value store; the token only in the secret store (expo-secure-store → Keychain), cached in
// memory, sent only as `Authorization: Bearer`, and never logged, put in the key-value store or in error text.
// src/platform/api.ts binds it to fetch and expo-secure-store.
import { z } from 'zod';
import type { KeyValueStore } from '@drum-coach/core/platform';
import type { ApiFailure, HomeServer, ServerHealth } from '../platform/contracts';
import { normalizeServerUrl } from '../platform/capabilitiesCore';
import { KV_KEYS } from './kv';
import { createSseParser, createUtf8Decoder, type SseEvent } from './sse';

/** server/guard.ts MIN_TOKEN_LENGTH: the server refuses to start with a shorter APP_TOKEN. */
export const MIN_TOKEN_LENGTH = 24;
/** The secret store key for the token. */
export const TOKEN_KEY = 'drumcoach.homeServer.token';
export const DEFAULT_TIMEOUT_MS = 30_000;
/** Above the server's own 180 s for a coach call (server/ai/providers.ts TIMEOUT_MS), so a slow answer still arrives. */
export const COACH_TIMEOUT_MS = 200_000;
export const HEALTH_TIMEOUT_MS = 8_000;
const DETAIL_MAX = 300;

export type SecretStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};
export type FetchInit = { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal };
export type FetchResponse = { status: number; text(): Promise<string> };
export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponse>;
/** A fetch whose response body streams (expo/fetch on iOS: `response.body.getReader()`). */
export type StreamReader = { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(reason?: unknown): Promise<void> };
export type StreamResponse = FetchResponse & { headers: { get(name: string): string | null }; body: { getReader(): StreamReader } | null };
export type StreamFetchLike = (url: string, init: FetchInit) => Promise<StreamResponse>;
type Method = Parameters<HomeServer['call']>[0];
type Result<T> = { ok: true; data: T } | ApiFailure;
/** One server-sent event; `json` is its data parsed, when the data is JSON. */
export type HomeServerEvent = SseEvent & { json?: unknown };
export type StreamResult = { ok: true; events: number; cancelled?: true } | ApiFailure;

const ServerHealthSchema = z.object({
  ok: z.literal(true), version: z.string(), coach: z.boolean(), tts: z.boolean(), stt: z.boolean(), youtube: z.boolean(),
});

/** Checks what the owner typed. Returns the cleaned config, or what's wrong with it (for the screen). */
export function validateServerConfig(url: string, token: string): { ok: true; url: string; token: string } | { ok: false; error: string } {
  const base = normalizeServerUrl(url);
  if (!base) return { ok: false, error: 'The address must start with http:// or https://, e.g. http://192.168.1.20:8787' };
  let parsed: URL;
  try { parsed = new URL(base); } catch { return { ok: false, error: 'That address is not a valid URL' }; }
  if (parsed.username || parsed.password) return { ok: false, error: 'Leave the name and password out of the address; the token goes in its own field' };
  if (parsed.search || parsed.hash) return { ok: false, error: 'The address must not have ? or # parts' };
  const t = token.trim();
  if (/\s/.test(t)) return { ok: false, error: 'The token has a space or line break in it; copy it again from .env' };
  if (t.length < MIN_TOKEN_LENGTH) return { ok: false, error: `The token is ${t.length} characters; APP_TOKEN has at least ${MIN_TOKEN_LENGTH}` };
  return { ok: true, url: base, token: t };
}

/** A path the client may call: /api/… with no scheme, host switch, whitespace or dot segments. */
export const safeApiPath = (path: string) => /^\/api\/[^\s\\]*$/.test(path) && !path.includes('//') && !/(^|\/)\.\.?(\/|$|\?)/.test(path);

/** The capability screens show, from a health answer. */
export const serverStatusOf = (r: ServerHealth | ApiFailure): 'reachable' | 'unreachable' | 'not-configured' =>
  r.ok ? 'reachable' : r.reason === 'not-configured' ? 'not-configured' : 'unreachable';

/** HTTP status → failure reason (2xx is not a failure). */
export function failureForStatus(status: number): ApiFailure['reason'] {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server-error';
  return 'bad-response';
}

export type HomeServerClient = HomeServer & {
  /** Has a token been saved (reads the secret store once, then the cache)? */
  hasToken(): Promise<boolean>;
  /**
   * A POST that answers with server-sent events (POST /api/coach/session): the same token, path check, timeouts
   * (`timeoutMs` bounds the whole stream; default 200 s for /api/coach/*) and typed failures as `call`. Calls
   * `onEvent` for each event as it arrives and resolves when the stream ends. Aborting `signal` stops it and resolves
   * `{ ok: true, cancelled: true }`. Never throws.
   */
  stream(path: `/api/${string}`, body: unknown, onEvent: (e: HomeServerEvent) => void,
    opts?: { timeoutMs?: number; signal?: AbortSignal }): Promise<StreamResult>;
};

export function createHomeServer(deps: { kv: KeyValueStore; secrets: SecretStore; fetch: FetchLike; streamFetch?: StreamFetchLike }): HomeServerClient {
  const { kv, secrets } = deps;
  let token: string | null | undefined; // undefined: not read yet
  const seen = new Set<string>(); // every token this session handled, so none can reach error text
  const remember = (t: string | null | undefined) => { if (t && t.length >= 8) seen.add(t); return t; }; // shorter: not a token, and scrubbing it would garble text
  const scrub = (text: string) => {
    let s = text;
    for (const t of seen) s = s.split(t).join('[token]');
    s = s.replace(/Bearer\s+\S+/gi, 'Bearer [token]');
    return s.length > DETAIL_MAX ? `${s.slice(0, DETAIL_MAX)}…` : s;
  };
  const fail = (reason: ApiFailure['reason'], detail?: string, status?: number, stage?: ApiFailure['stage']): ApiFailure =>
    ({ ok: false, reason, ...(status !== undefined && { status }), ...(detail !== undefined && { detail: scrub(detail) }), ...(stage && { stage }) });

  async function loadToken(): Promise<string | null> {
    if (token !== undefined) return token;
    try {
      const t = (await secrets.get(TOKEN_KEY)) || null;
      remember(t);
      token = t;
      return t;
    } catch {
      return null; // try again next time (e.g. Keychain locked before first unlock)
    }
  }
  const baseUrl = () => normalizeServerUrl(kv.get(KV_KEYS.homeServerUrl));

  type Prepared = { url: string; base: string; init: FetchInit; timeoutMs: number; timedOut(): boolean; done(): void };
  /** What every request needs: the address, a safe path, the token, the JSON body and a timeout. */
  async function prepare(method: Method, path: string, body: unknown, accept: string, timeoutMs: number, signal?: AbortSignal): Promise<Prepared | ApiFailure> {
    const base = baseUrl();
    if (!base) return fail('not-configured', 'No home server address yet: add it in Setup → Coach');
    if (!safeApiPath(path)) return fail('bad-response', 'Not an /api/ path');
    const tok = await loadToken();
    if (!tok) return fail('not-configured', 'No token saved for the home server: add it in Setup → Coach');
    const headers: Record<string, string> = { accept, authorization: `Bearer ${tok}` }; // no Origin: the server treats one as a web page
    let payload: string | undefined;
    if (body !== undefined) {
      try {
        payload = JSON.stringify(body);
      } catch {
        return fail('bad-response', 'The request body could not be turned into JSON');
      }
      headers['content-type'] = 'application/json';
    }
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onCancel = () => controller.abort();
    signal?.addEventListener('abort', onCancel);
    if (signal?.aborted) controller.abort();
    return {
      url: base + path, base, timeoutMs, timedOut: () => timedOut,
      init: { method, headers, body: payload, signal: controller.signal },
      done: () => { clearTimeout(timer); signal?.removeEventListener('abort', onCancel); },
    };
  }
  const seconds = (ms: number) => Math.round(ms / 1000);
  // A fetch that throws on its own never got its request to the server; one we aborted at the timeout may have.
  const networkFailure = (p: Prepared, e: unknown) => (p.timedOut()
    ? fail('unreachable', `No answer from ${p.base} within ${seconds(p.timeoutMs)} s`, undefined, 'answer')
    : fail('unreachable', `Can't reach ${p.base} (${e instanceof Error ? e.message : 'network error'}). Same Wi-Fi? Server running? Local Network allowed?`, undefined, 'connect'));
  const statusFailure = (status: number, text: string) => {
    let detail = '';
    try { const j = JSON.parse(text) as { error?: unknown }; if (typeof j?.error === 'string') detail = j.error; } catch { /* not JSON */ }
    if (status === 401) token = undefined; // the owner may have fixed the token in another way; read it again next time
    return fail(failureForStatus(status), detail || `HTTP ${status}`, status);
  };
  const defaultTimeout = (path: string) => (path.startsWith('/api/coach/') ? COACH_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

  async function call<T>(method: Method, path: `/api/${string}`, body?: unknown, opts: { timeoutMs?: number } = {}): Promise<Result<T>> {
    const p = await prepare(method, path, body, 'application/json', opts.timeoutMs ?? defaultTimeout(path));
    if ('ok' in p) return p;
    try {
      let res: FetchResponse;
      try {
        res = await deps.fetch(p.url, p.init);
      } catch (e) {
        return networkFailure(p, e);
      }
      let text: string;
      try {
        text = await res.text();
      } catch {
        return p.timedOut()
          ? fail('unreachable', `The answer from ${p.base} took longer than ${seconds(p.timeoutMs)} s`, res.status, 'answer')
          : fail('bad-response', 'The answer was cut off', res.status);
      }
      if (res.status < 200 || res.status >= 300) return statusFailure(res.status, text);
      if (!text) return { ok: true, data: null as T };
      try {
        return { ok: true, data: JSON.parse(text) as T };
      } catch {
        return fail('bad-response', 'The server answered with something that is not JSON', res.status);
      }
    } finally {
      p.done();
    }
  }

  async function stream(path: `/api/${string}`, body: unknown, onEvent: (e: HomeServerEvent) => void,
    opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<StreamResult> {
    if (!deps.streamFetch) return fail('bad-response', 'Streaming is not available in this build');
    const p = await prepare('POST', path, body, 'text/event-stream', opts.timeoutMs ?? defaultTimeout(path), opts.signal);
    if ('ok' in p) return p;
    const cancelled = () => !!opts.signal?.aborted && !p.timedOut();
    let events = 0;
    try {
      if (cancelled()) return { ok: true, events, cancelled: true };
      let res: StreamResponse;
      try {
        res = await deps.streamFetch(p.url, p.init);
      } catch (e) {
        return cancelled() ? { ok: true, events, cancelled: true } : networkFailure(p, e);
      }
      if (res.status < 200 || res.status >= 300) {
        let text = '';
        try { text = await res.text(); } catch { /* the status is enough */ }
        return statusFailure(res.status, text);
      }
      if (!/^text\/event-stream\b/i.test(res.headers.get('content-type') ?? '') || !res.body) {
        return fail('bad-response', 'The server did not answer with an event stream', res.status);
      }
      let handlerError: unknown;
      const parser = createSseParser(e => {
        if (handlerError !== undefined) return;
        events++;
        let json: unknown;
        try { json = JSON.parse(e.data); } catch { /* not JSON: data only */ }
        try { onEvent(json === undefined ? e : { ...e, json }); } catch (err) { handlerError = err ?? 'error'; }
      });
      const decoder = createUtf8Decoder();
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) parser.push(decoder.decode(value));
          if (handlerError !== undefined) {
            void reader.cancel().catch(() => {});
            return fail('bad-response', `The event handler failed: ${handlerError instanceof Error ? handlerError.message : String(handlerError)}`);
          }
        }
        parser.push(decoder.decode(new Uint8Array(), true));
        parser.end();
      } catch (e) {
        if (cancelled()) return { ok: true, events, cancelled: true };
        return fail('unreachable', p.timedOut()
          ? `The coach stream from ${p.base} stopped after ${seconds(p.timeoutMs)} s`
          : `The stream from ${p.base} broke off (${e instanceof Error ? e.message : 'network error'})`, undefined, 'answer');
      }
      return { ok: true, events };
    } finally {
      p.done();
    }
  }

  return {
    async configure(cfg) {
      if (cfg === null) {
        kv.remove(KV_KEYS.homeServerUrl);
        token = null;
        try { await secrets.remove(TOKEN_KEY); } catch { /* nothing to remove */ }
        return;
      }
      remember(cfg.token.trim());
      const v = validateServerConfig(cfg.url, cfg.token);
      if (!v.ok) return; // screens check with validateServerConfig first; a bad config changes nothing
      try {
        await secrets.set(TOKEN_KEY, v.token);
        token = v.token;
      } catch {
        token = undefined; // not saved: calls say "no token saved"
      }
      kv.set(KV_KEYS.homeServerUrl, v.url);
    },
    configured() {
      const url = baseUrl();
      return url ? { url } : null;
    },
    hasToken: async () => !!(await loadToken()),
    async health() {
      const r = await call<unknown>('GET', '/api/health', undefined, { timeoutMs: HEALTH_TIMEOUT_MS });
      if (!r.ok) return r;
      const h = ServerHealthSchema.safeParse(r.data);
      return h.success ? h.data : fail('bad-response', 'That server answered /api/health, but not like Drum Coach does');
    },
    call,
    stream,
  };
}
