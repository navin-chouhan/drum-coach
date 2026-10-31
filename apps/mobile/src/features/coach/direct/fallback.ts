// D2: the home server first; the iPad's own API key only when the server can't be reached (or isn't set up yet).
// Wraps the HomeServer the coach uses: a coach route that fails with `unreachable` / `not-configured` is asked again
// through the Anthropic API (direct.ts) when a key is in the Keychain; every other answer or failure passes through.
// If the fallback can't reach Anthropic either, the server's own failure comes back (the panel's offline card, which
// says the fallback was tried); any other fallback error comes back as the coach's error, in its words.
import type { ApiFailure, HomeServer, HomeServerEvent, StreamResult } from '../../../platform/contracts';
import { DIRECT_PATHS, type DirectCoach, type DirectFailure, type DirectPath } from './direct';

/**
 * Only when the request never reached the server (QA4 M1): not set up, or a connection that failed before sending.
 * A timeout after sending means the server may still be answering (and paying for) it: no second, paid call.
 */
export const fallsBack = (f: ApiFailure) => f.reason === 'not-configured' || (f.reason === 'unreachable' && f.stage === 'connect');

const failureOf = (f: DirectFailure, server: ApiFailure): ApiFailure =>
  f.kind === 'network' ? server
    : f.kind === 'rate-limited' ? { ok: false, reason: 'rate-limited', detail: f.message }
      : { ok: false, reason: 'server-error', detail: `The API-key fallback: ${f.message}` };

const directPath = (path: string): DirectPath | undefined => {
  const m = /^\/api\/coach\/([a-z]+)$/.exec(path);
  return m && (DIRECT_PATHS as readonly string[]).includes(m[1]) ? m[1] as DirectPath : undefined;
};

export function withDirectFallback<S extends Pick<HomeServer, 'call' | 'stream'>>(server: S, direct: DirectCoach, hasKey: () => Promise<boolean>): S {
  const keyed = async () => { try { return await hasKey(); } catch { return false; } };
  const call = async <T,>(method: Parameters<HomeServer['call']>[0], path: `/api/${string}`, body?: unknown, opts?: { timeoutMs?: number }):
    Promise<{ ok: true; data: T } | ApiFailure> => {
    const r = await server.call<T>(method, path, body, opts);
    const p = method === 'POST' ? directPath(path) : undefined;
    if (r.ok || !p || !fallsBack(r) || !(await keyed())) return r;
    const d = await direct.route(p, body);
    return d.ok ? { ok: true, data: d.data as T } : failureOf(d, r);
  };
  const stream: HomeServer['stream'] = async (path, body, onEvent, opts) => {
    const r = await server.stream(path, body, onEvent, opts);
    if (r.ok || path !== '/api/coach/session' || !fallsBack(r) || !(await keyed())) return r;
    const emit = (e: HomeServerEvent) => onEvent(e);
    const d = await direct.session(body, s => emit({ event: 'say', data: JSON.stringify(s), json: s }));
    if (d.ok) { emit({ event: 'reply', data: JSON.stringify(d.reply), json: d.reply }); return { ok: true, events: 2 } satisfies StreamResult; }
    if (d.kind === 'network') return r;
    emit({ event: 'error', data: '', json: { error: d.message } });
    return { ok: true, events: 1 };
  };
  return { ...server, call, stream };
}
