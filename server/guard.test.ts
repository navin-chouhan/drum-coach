import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { accessConfig, AccessConfigError, accessSummary, allowedRequest, childEnv, guardHook, health, hostName, isLoopback, looksLikeAudio, proxied, tokenMatches, verdict } from './guard';

describe('local API guard', () => {
  it("lets the app's own pages and local tools in", () => {
    expect(allowedRequest({ host: 'localhost:5173', 'sec-fetch-site': 'same-origin' })).toBe(true); // through Vite's proxy
    expect(allowedRequest({ host: 'localhost:5173', origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' })).toBe(true); // a POST
    expect(allowedRequest({ host: '127.0.0.1:8787' })).toBe(true); // curl, the play test (Node fetch)
    expect(allowedRequest({ host: 'localhost:8787', 'sec-fetch-site': 'none' })).toBe(true); // typed into the address bar
  });
  it('blocks DNS rebinding', () => {
    expect(allowedRequest({ host: 'evil.example:8787' })).toBe(false);
    expect(allowedRequest({})).toBe(false);
  });
  it('blocks other websites, even on a GET without an Origin (an <img>, a no-cors fetch)', () => {
    expect(allowedRequest({ host: 'localhost:8787', 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(allowedRequest({ host: 'localhost:8787', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).toBe(false);
    expect(allowedRequest({ host: 'localhost:8787', origin: 'null' })).toBe(false);
  });
  it("blocks pages served on other localhost ports (another project's dev server, a downloaded HTML file)", () => {
    expect(allowedRequest({ host: 'localhost:8787', 'sec-fetch-site': 'same-site' })).toBe(false);
    expect(allowedRequest({ host: 'localhost:8787', origin: 'http://localhost:3000', 'sec-fetch-site': 'same-site' })).toBe(false);
  });
  it('refuses a repeated or odd Sec-Fetch-Site', () => {
    expect(allowedRequest({ host: 'localhost:8787', 'sec-fetch-site': ['same-origin', 'cross-site'] })).toBe(false);
    expect(allowedRequest({ host: 'localhost:8787', 'sec-fetch-site': 'Same-Origin' })).toBe(false);
  });
});

describe('audio uploads', () => {
  const pad = (head: number[] | string) => Buffer.concat([typeof head === 'string' ? Buffer.from(head, 'latin1') : Buffer.from(head), Buffer.alloc(32)]);
  it('accepts the formats the app takes, by their first bytes', () => {
    expect(looksLikeAudio(pad('ID3\x04'), 'mp3')).toBe(true);
    expect(looksLikeAudio(pad([0xff, 0xfb, 0x90]), 'mp3')).toBe(true); // an MP3 frame without a tag
    expect(looksLikeAudio(pad('OggS'), 'ogg')).toBe(true);
    expect(looksLikeAudio(pad('RIFF\0\0\0\0WAVEfmt '), 'wav')).toBe(true);
    expect(looksLikeAudio(pad('fLaC'), 'flac')).toBe(true);
    expect(looksLikeAudio(pad('\0\0\0\x20ftypM4A '), 'm4a')).toBe(true);
    expect(looksLikeAudio(pad([0xff, 0xf1]), 'aac')).toBe(true);
    expect(looksLikeAudio(pad([0x1a, 0x45, 0xdf, 0xa3]), 'webm')).toBe(true);
  });
  it('refuses anything else, whatever its Content-Type said', () => {
    expect(looksLikeAudio(pad('<html><script>'), 'mp3')).toBe(false);
    expect(looksLikeAudio(pad('OggS'), 'wav')).toBe(false); // a different format than claimed
    expect(looksLikeAudio(pad('RIFF\0\0\0\0AVI '), 'wav')).toBe(false);
    expect(looksLikeAudio(Buffer.from('RIFF'), 'wav')).toBe(false); // too short to be a file
    expect(looksLikeAudio(pad('ID3'), 'exe')).toBe(false);
  });
});

describe('child process environment', () => {
  it("drops this app's secrets and keeps the rest", () => {
    const env = childEnv({ PATH: '/usr/bin', HOME: '/home/me', ANTHROPIC_API_KEY: 'sk-ant-x', YOUTUBE_API_KEY: 'AIza-x' });
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/me' });
  });
});

// ---------- home-server mode (D2) ----------
const TOKEN = 'k3Jq9vR2xL7mN4pT8wY1zB6cD0fG5hS=';
const home = accessConfig({ APP_HOST: '192.168.1.20', APP_TOKEN: TOKEN, ALLOWED_HOSTS: 'My-Mac.tailnet.ts.net, 100.64.0.7' });
const local = accessConfig({});
const ask = (remoteAddress: string, headers: Record<string, string>, a = home) => verdict({ remoteAddress, headers }, a);
const auth = { authorization: `Bearer ${TOKEN}` };

describe('home-server config', () => {
  it('defaults to loopback with no token, as before', () => {
    expect(local).toEqual({ host: '127.0.0.1', token: undefined, allowedHosts: new Set() });
    expect(accessSummary(local)).toMatch(/^Local only/);
  });
  it('refuses to start beyond loopback without a strong token', () => {
    expect(() => accessConfig({ APP_HOST: '192.168.1.20' })).toThrow(AccessConfigError);
    expect(() => accessConfig({ APP_HOST: '0.0.0.0', APP_TOKEN: '  ' })).toThrow(/APP_TOKEN must be set/);
    expect(() => accessConfig({ APP_HOST: '192.168.1.20', APP_TOKEN: 'short-token-123' })).toThrow(/at least 24/);
    expect(() => accessConfig({ APP_TOKEN: 'short' })).toThrow(/at least 24/); // a weak token is never used, even on loopback
  });
  it('ignores a plain HOST, which some shells export: only APP_HOST moves the server', () => {
    expect(accessConfig({ HOST: 'my-laptop' }).host).toBe('127.0.0.1');
  });
  it('every interface needs ALLOWED_HOSTS; a bound address is allowed by itself', () => {
    expect(() => accessConfig({ APP_HOST: '0.0.0.0', APP_TOKEN: TOKEN })).toThrow(/ALLOWED_HOSTS/);
    expect([...accessConfig({ APP_HOST: '0.0.0.0', APP_TOKEN: TOKEN, ALLOWED_HOSTS: '192.168.1.20:8787' }).allowedHosts]).toEqual(['192.168.1.20']);
    expect([...home.allowedHosts]).toEqual(['my-mac.tailnet.ts.net', '100.64.0.7', '192.168.1.20']);
    expect([...accessConfig({ APP_HOST: 'fd7a:115c:a1e0::7', APP_TOKEN: TOKEN }).allowedHosts]).toEqual(['fd7a:115c:a1e0::7']);
    expect(accessSummary(home)).toContain('192.168.1.20');
    expect(accessSummary(home)).not.toContain(TOKEN);
  });
  it('knows loopback addresses and Host names', () => {
    for (const a of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1', 'localhost', '[::1]']) expect(isLoopback(a)).toBe(true);
    for (const a of ['192.168.1.20', '::ffff:10.0.0.1', '', '1270.0.0.1', '0.0.0.0', undefined]) expect(isLoopback(a)).toBe(false);
    expect(hostName('My-Mac.local:8787')).toBe('my-mac.local');
    expect(hostName('[fd7a::7]:8787')).toBe('fd7a::7');
    expect(hostName('[broken')).toBe('');
    expect(hostName(undefined)).toBe('');
  });
  it('matches only the exact Bearer token', () => {
    expect(tokenMatches(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(tokenMatches(`bearer ${TOKEN}`, TOKEN)).toBe(true);
    for (const h of [`Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(0, -1)}`, TOKEN, `Basic ${TOKEN}`, 'Bearer ', undefined]) expect(tokenMatches(h, TOKEN)).toBe(false);
  });
});

describe('who may call', () => {
  it("this machine's app and tools need no token, as before", () => {
    for (const a of [local, home]) {
      expect(ask('127.0.0.1', { host: 'localhost:5173', origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' }, a)).toBe(200);
      expect(ask('::1', { host: '127.0.0.1:8787' }, a)).toBe(200);
      expect(ask('::ffff:127.0.0.1', { host: 'localhost:8787' }, a)).toBe(200);
    }
    expect(ask('127.0.0.1', { host: 'evil.example:8787' }, local)).toBe(403); // DNS rebinding
    expect(ask('127.0.0.1', { host: 'localhost:8787', 'sec-fetch-site': 'cross-site' }, local)).toBe(403); // another website
  });
  it('another machine never passes as local, whatever Host it claims', () => {
    expect(ask('192.168.1.50', { host: 'localhost:8787' }, local)).toBe(403); // no home-server mode: the old answer
    expect(ask('192.168.1.50', { host: 'localhost:8787' })).toBe(401);
    expect(ask('192.168.1.50', { host: 'localhost:8787', ...auth })).toBe(403); // localhost isn't an allowed name
  });
  it('a remote request needs the token, an allowed Host and no browser headers', () => {
    expect(ask('192.168.1.50', { host: '192.168.1.20:8787' })).toBe(401);
    expect(ask('192.168.1.50', { host: '192.168.1.20:8787', authorization: 'Bearer wrong-token-wrong-token-wrong' })).toBe(401);
    expect(ask('192.168.1.50', { host: '192.168.1.20:8787', ...auth })).toBe(200);
    expect(ask('100.101.102.103', { host: 'my-mac.tailnet.ts.net', ...auth })).toBe(200);
    expect(ask('192.168.1.50', { host: '192.168.1.20:8787', origin: 'https://evil.example', ...auth })).toBe(403);
    expect(ask('192.168.1.50', { host: '192.168.1.20:8787', origin: 'null', ...auth })).toBe(403);
    expect(ask('192.168.1.50', { host: '192.168.1.20:8787', 'sec-fetch-site': 'cross-site', ...auth })).toBe(403); // an <img> on a web page
    expect(ask('192.168.1.50', { host: 'evil.example:8787', ...auth })).toBe(403);
    expect(ask('192.168.1.50', { ...auth })).toBe(403);
  });
  it('a request through a reverse proxy on this machine is never local: it needs the token', () => {
    const viaProxy = { host: 'localhost:8787', 'x-forwarded-for': '100.101.102.103' }; // a proxy that rewrote Host to localhost
    expect(ask('127.0.0.1', viaProxy)).toBe(401);
    expect(ask('127.0.0.1', viaProxy, local)).toBe(403); // no home-server mode
    expect(ask('127.0.0.1', { ...viaProxy, ...auth })).toBe(403); // localhost isn't an allowed name
    expect(ask('127.0.0.1', { ...viaProxy, ...auth, host: 'my-mac.tailnet.ts.net' })).toBe(200);
    for (const h of ['forwarded', 'x-forwarded-host', 'x-real-ip', 'via', 'tailscale-user-login', 'Tailscale-Headers-Info']) {
      expect(proxied({ [h]: 'x' })).toBe(true);
      expect(ask('127.0.0.1', { host: 'localhost:8787', [h]: 'x' })).toBe(401);
    }
    expect(proxied({ host: 'localhost:5173', origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' })).toBe(false); // Vite's proxy
  });
  it('a proxy on this machine (tailscale serve) takes the token path', () => {
    const served = accessConfig({ APP_TOKEN: TOKEN, ALLOWED_HOSTS: 'my-mac.tailnet.ts.net' });
    expect(ask('127.0.0.1', { host: 'my-mac.tailnet.ts.net' }, served)).toBe(401);
    expect(ask('127.0.0.1', { host: 'my-mac.tailnet.ts.net', ...auth }, served)).toBe(200);
  });
});

describe('the guard hook', () => {
  it('answers 401/403 before the route and the rate limit, and never logs the token', async () => {
    let log = '';
    const stream = new Writable({ write(chunk, _enc, done) { log += String(chunk); done(); } });
    const app = Fastify({ logger: { level: 'info', stream } }); // server/index.ts's logger options, captured
    app.addHook('onRequest', guardHook(home));
    await app.register(rateLimit, { timeWindow: '1 minute', max: 2 });
    let reached = 0;
    app.post('/api/x', async () => { reached++; return { ok: true }; });
    const call = (headers: Record<string, string>) => app.inject({ method: 'POST', url: '/api/x', remoteAddress: '192.168.1.50', headers, payload: {} });
    for (let i = 0; i < 3; i++) {
      const none = await call({ host: '192.168.1.20:8787' });
      expect(none.statusCode).toBe(401);
      expect(none.headers['www-authenticate']).toBe('Bearer');
    }
    expect((await call({ host: 'evil.example', ...auth })).statusCode).toBe(403);
    expect(reached).toBe(0);
    expect((await call({ host: '192.168.1.20:8787', ...auth })).statusCode).toBe(200); // the refused calls used none of the limit
    expect(reached).toBe(1);
    expect((await app.inject({ url: '/nope', remoteAddress: '192.168.1.50', headers: { host: '192.168.1.20' } })).statusCode).toBe(401); // unknown routes too
    expect((await app.inject({ method: 'POST', url: '/api/x', headers: { host: 'localhost:8787' }, payload: {} })).statusCode).toBe(200); // inject comes from 127.0.0.1
    expect(log).toContain('incoming request');
    expect(log).not.toContain(TOKEN);
    expect(log.toLowerCase()).not.toContain('authorization');
    await app.close();
  });
  it('health says what works, nothing more', () => {
    expect(health({ coach: true, tts: false, stt: true, youtube: false })).toEqual({ ok: true, version: '1.0.0', coach: true, tts: false, stt: true, youtube: false });
  });
});
