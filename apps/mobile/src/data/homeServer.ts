// HomeServer (contracts.ts), the pure part: the client for the owner's home server (D2, docs/mobile/HOME-SERVER.md).
// The URL is in the key-value store; the token only in the secret store (expo-secure-store → Keychain), cached in
// memory, sent only as `Authorization: Bearer`, and never logged, put in the key-value store or in error text.
// src/platform/api.ts binds it to fetch and expo-secure-store.
import { z } from 'zod';
import type { KeyValueStore } from '@drum-coach/core/platform';
import type { ApiFailure, HomeServer, ServerHealth } from '../platform/contracts';
import { normalizeServerUrl } from '../platform/capabilitiesCore';
import { KV_KEYS } from './kv';

/** server/guard.ts MIN_TOKEN_LENGTH: the server refuses to start with a shorter APP_TOKEN. */
export const MIN_TOKEN_LENGTH = 24;
/** The secret store key for the token. */
export const TOKEN_KEY = 'drumcoach.homeServer.token';
export const DEFAULT_TIMEOUT_MS = 30_000;
export const COACH_TIMEOUT_MS = 120_000;
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
type Method = Parameters<HomeServer['call']>[0];
type Result<T> = { ok: true; data: T } | ApiFailure;

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
};

export function createHomeServer(deps: { kv: KeyValueStore; secrets: SecretStore; fetch: FetchLike }): HomeServerClient {
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
  const fail = (reason: ApiFailure['reason'], detail?: string, status?: number): ApiFailure =>
    ({ ok: false, reason, ...(status !== undefined && { status }), ...(detail !== undefined && { detail: scrub(detail) }) });

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

  async function call<T>(method: Method, path: `/api/${string}`, body?: unknown, opts: { timeoutMs?: number } = {}): Promise<Result<T>> {
    const base = baseUrl();
    if (!base) return fail('not-configured', 'No home server address yet: add it in Setup → Coach');
    if (!safeApiPath(path)) return fail('bad-response', 'Not an /api/ path');
    const tok = await loadToken();
    if (!tok) return fail('not-configured', 'No token saved for the home server: add it in Setup → Coach');
    const timeoutMs = opts.timeoutMs ?? (path.startsWith('/api/coach/') ? COACH_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
    const headers: Record<string, string> = { accept: 'application/json', authorization: `Bearer ${tok}` }; // no Origin: the server treats one as a web page
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
    try {
      let res: FetchResponse;
      try {
        res = await deps.fetch(base + path, { method, headers, body: payload, signal: controller.signal });
      } catch (e) {
        return fail('unreachable', timedOut
          ? `No answer from ${base} within ${Math.round(timeoutMs / 1000)} s`
          : `Can't reach ${base} (${e instanceof Error ? e.message : 'network error'}). Same Wi-Fi? Server running? Local Network allowed?`);
      }
      let text: string;
      try {
        text = await res.text();
      } catch {
        return fail(timedOut ? 'unreachable' : 'bad-response', timedOut ? `The answer from ${base} took longer than ${Math.round(timeoutMs / 1000)} s` : 'The answer was cut off', res.status);
      }
      if (res.status < 200 || res.status >= 300) {
        let detail = '';
        try { const j = JSON.parse(text) as { error?: unknown }; if (typeof j?.error === 'string') detail = j.error; } catch { /* not JSON */ }
        if (res.status === 401) token = undefined; // the owner may have fixed the token in another way; read it again next time
        return fail(failureForStatus(res.status), detail || `HTTP ${res.status}`, res.status);
      }
      if (!text) return { ok: true, data: null as T };
      try {
        return { ok: true, data: JSON.parse(text) as T };
      } catch {
        return fail('bad-response', 'The server answered with something that is not JSON', res.status);
      }
    } finally {
      clearTimeout(timer);
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
  };
}
