// Who may call the API.
// - This app's own pages (through Vite's proxy) and local tools such as the play test, from a loopback address and
//   not through a reverse proxy (no X-Forwarded-For, Forwarded, Via, Tailscale-… headers):
//   - Host blocks DNS rebinding (a website whose name points at 127.0.0.1).
//   - Origin blocks pages from other origins on writes.
//   - Sec-Fetch-Site blocks other websites, and pages on other localhost ports, on every request: browsers send it even
//     on a plain <img> or no-cors GET, which carry no Origin. curl and Node's fetch don't send it.
// - Home-server mode (D2, only when APP_TOKEN is set): the iPad app over the LAN or Tailscale. It needs
//   `Authorization: Bearer <APP_TOKEN>` (compared in constant time), a Host in ALLOWED_HOSTS or the address the server
//   is bound to, and no browser headers (Origin, Sec-Fetch-Site): the native app sends none, so they mean a web page,
//   which stays out. The token is read only from that header, never the URL (which the logger writes), and Fastify's
//   default request serializer logs no headers.
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import { join } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const OWN_SITE = new Set(['same-origin', 'none']); // none: typed into the address bar

export function allowedRequest(headers: { host?: string; origin?: string; 'sec-fetch-site'?: string | string[] }) {
  const host = (headers.host ?? '').replace(/:\d+$/, '');
  const site = headers['sec-fetch-site'];
  return LOCAL_HOSTS.has(host)
    && (headers.origin === undefined || LOCAL_ORIGIN.test(headers.origin))
    && (site === undefined || (typeof site === 'string' && OWN_SITE.has(site)));
}

// ---------- home-server mode: where the server listens, and who else may call it ----------
export const MIN_TOKEN_LENGTH = 24;
export type Access = {
  host: string; // where the server listens (APP_HOST)
  token?: string; // APP_TOKEN: set = home-server mode
  allowedHosts: ReadonlySet<string>; // Host names (no port, lower case) a token request may use
};
export class AccessConfigError extends Error {}

/** A loopback address (127.0.0.0/8, ::1, IPv4-mapped 127.x) or the name localhost. */
export function isLoopback(addr = '') {
  const a = addr.trim().toLowerCase().replace(/^\[(.*)\]$/, '$1').replace(/^::ffff:/, '');
  return a === 'localhost' || a === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a);
}
const isWildcard = (h: string) => h === '0.0.0.0' || h === '::';

/** The name a request asked for: its Host header without the port, in lower case (an IPv6 literal without brackets). */
export function hostName(header?: string) {
  const h = (header ?? '').trim().toLowerCase();
  if (h.startsWith('[')) { const end = h.indexOf(']'); return end > 0 ? h.slice(1, end) : ''; }
  return h.replace(/:\d+$/, '');
}

/**
 * Reads APP_HOST, APP_TOKEN and ALLOWED_HOSTS. Throws (the server then refuses to start) when the API would be reachable
 * from other machines without a strong token, when a token is too short to be one, or when nothing names this server.
 */
export function accessConfig(env: Record<string, string | undefined>): Access {
  const host = (env.APP_HOST ?? '').trim() || '127.0.0.1';
  const token = (env.APP_TOKEN ?? '').trim() || undefined;
  const allowedHosts = new Set((env.ALLOWED_HOSTS ?? '').split(',').map(hostName).filter(Boolean));
  const loopback = isLoopback(host);
  const make = 'make one with: openssl rand -base64 32';
  if (!loopback && !token) throw new AccessConfigError(`APP_HOST=${host} would open the API to other machines, so APP_TOKEN must be set (at least ${MIN_TOKEN_LENGTH} characters; ${make}). Not starting.`);
  if (token && token.length < MIN_TOKEN_LENGTH) throw new AccessConfigError(`APP_TOKEN is ${token.length} characters; it must be at least ${MIN_TOKEN_LENGTH} (${make}). Not starting.`);
  if (isWildcard(host) && !allowedHosts.size) throw new AccessConfigError(`APP_HOST=${host} listens on every interface: set ALLOWED_HOSTS to the address or name the iPad uses (e.g. ALLOWED_HOSTS=192.168.1.20,my-mac.tailnet.ts.net). Not starting.`);
  if (!loopback && !isWildcard(host)) allowedHosts.add(hostName(host.includes(':') ? `[${host}]` : host)); // the bound address
  return { host, token, allowedHosts };
}

/** Whether an Authorization header carries the token. Constant-time: both sides are hashed to the same length first. */
export function tokenMatches(header: string | undefined, token: string) {
  const m = /^Bearer +(\S+) *$/i.exec(header ?? '');
  if (!m) return false;
  const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
  return timingSafeEqual(digest(m[1]), digest(token));
}

/**
 * Headers a reverse proxy adds (tailscale serve, Caddy, nginx). A proxy on this machine connects from 127.0.0.1 and may
 * rewrite Host to localhost, so a proxied request is never "this machine": it takes the token path. Vite's dev proxy
 * adds none of them (its `xfwd` is off).
 */
const PROXY_HEADERS = ['x-forwarded-for', 'forwarded', 'x-forwarded-host', 'x-real-ip', 'via'];
export const proxied = (headers: IncomingHttpHeaders) =>
  PROXY_HEADERS.some(h => headers[h] !== undefined) || Object.keys(headers).some(h => h.toLowerCase().startsWith('tailscale-'));

/** 200 = let it through; 401 = no or wrong token; 403 = not this app (Host, Origin, Sec-Fetch-Site), or no home-server mode. */
export function verdict(req: { remoteAddress?: string; headers: IncomingHttpHeaders }, a: Access): 200 | 401 | 403 {
  const { headers } = req;
  if (isLoopback(req.remoteAddress) && !proxied(headers) && allowedRequest(headers)) return 200; // this machine's app and tools, as before
  if (!a.token) return 403; // no home-server mode: the answer it always was
  if (!tokenMatches(headers.authorization, a.token)) return 401;
  if (headers.origin !== undefined || headers['sec-fetch-site'] !== undefined) return 403; // a browser page
  return a.allowedHosts.has(hostName(headers.host)) ? 200 : 403;
}

/** The onRequest hook. Register it before the rate limits: a refused request is answered before the body is read or counted. */
export const guardHook = (a: Access) => async (req: FastifyRequest, reply: FastifyReply) => {
  // The socket's address, never X-Forwarded-For (a remote caller could claim to be 127.0.0.1).
  const v = verdict({ remoteAddress: req.raw.socket?.remoteAddress, headers: req.headers }, a);
  if (v === 401) return reply.code(401).header('www-authenticate', 'Bearer').send({ error: 'Unauthorized' });
  if (v === 403) return reply.code(403).send({ error: 'Forbidden' });
};

/** One line for the start-up log; never the token. */
export const accessSummary = (a: Access) => a.token
  ? `Home-server mode on ${a.host}: other devices need the APP_TOKEN and one of these Host names: ${[...a.allowedHosts].join(', ') || '(none: only through a proxy on this machine)'}`
  : `Local only (${a.host}): no APP_TOKEN, so only this machine's app can call the API`;

/** GET /api/health, the iPad's "Test connection": what works on this server, yes or no. No keys, paths or names. */
export const APP_VERSION: string = (() => {
  try { return String((JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { version?: string }).version ?? 'unknown'); } catch { return 'unknown'; }
})();
export const health = (s: { coach: boolean; tts: boolean; stt: boolean; youtube: boolean }) =>
  ({ ok: true as const, version: APP_VERSION, coach: s.coach, tts: s.tts, stt: s.stt, youtube: s.youtube });

// Uploads are stored (backing tracks) or handed to Whisper (questions) only when their first bytes are the audio format
// they claim to be, not just their Content-Type.
const AUDIO_MAGIC: Record<string, (b: Buffer) => boolean> = {
  mp3: b => b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  ogg: b => b.toString('latin1', 0, 4) === 'OggS',
  wav: b => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE',
  flac: b => b.toString('latin1', 0, 4) === 'fLaC',
  m4a: b => b.toString('latin1', 4, 8) === 'ftyp',
  aac: b => b[0] === 0xff && (b[1] & 0xf6) === 0xf0,
  webm: b => b.readUInt32BE(0) === 0x1a45dfa3,
};
export const looksLikeAudio = (body: Buffer, ext: string) => body.length >= 12 && !!AUDIO_MAGIC[ext]?.(body);

// The helpers this server starts (the claude CLI, Piper, Whisper through uv) get its environment without its secrets:
// none of them needs the keys, and a bad release of one of their Python packages would otherwise get both.
const SECRETS = ['ANTHROPIC_API_KEY', 'YOUTUBE_API_KEY'];
export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const k of SECRETS) delete out[k];
  return out;
}
