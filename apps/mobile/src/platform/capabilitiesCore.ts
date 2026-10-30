// The pure part of Capabilities (tested in Node). capabilities.ts supplies the device facts.
import type { Capabilities } from './contracts';

export type CoachServerStatus = Capabilities['coachServer'];
type FetchLike = (url: string, init: { signal: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  json(): Promise<unknown>;
}>;

/** What this build/device can do right now. The coach server starts 'unknown' (or 'not-configured') until probed. */
export function buildCapabilities(facts: { midiModulePresent: boolean; coachServerUrl: string | null }): Capabilities {
  return {
    midi: facts.midiModulePresent,
    tabCapture: false,
    coachServer: facts.coachServerUrl ? 'unknown' : 'not-configured',
  };
}

/** `http://host:port/` → `http://host:port`; anything that isn't an http(s) URL → null. */
export function normalizeServerUrl(url: string | null | undefined): string | null {
  const s = url?.trim();
  if (!s || !/^https?:\/\/[^/\s]+/i.test(s)) return null;
  return s.replace(/\/+$/, '');
}

/**
 * GET <server>/api/health with a timeout. 'reachable' only for a 2xx whose JSON is `{ ok: true }`; every failure
 * (timeout, refused, 403 from a localhost-only server, bad JSON) is 'unreachable'. Never throws.
 */
export async function probeCoachServer(url: string | null | undefined, fetchFn: FetchLike, timeoutMs = 2500): Promise<CoachServerStatus> {
  const base = normalizeServerUrl(url);
  if (!base) return 'not-configured';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(`${base}/api/health`, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return 'unreachable';
    const body = await res.json();
    return typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === true ? 'reachable' : 'unreachable';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}
