import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COACH_TIMEOUT_MS, createHomeServer, DEFAULT_TIMEOUT_MS, failureForStatus, safeApiPath, serverStatusOf, TOKEN_KEY, validateServerConfig,
  type FetchLike, type SecretStore,
} from './homeServer';
import { createKv, KV_KEYS } from './kv';

const TOKEN = 'fake-test-token-'.padEnd(36, 'x'); // obviously fake, low entropy: secret scanners leave it alone
const URL_ = 'http://192.168.1.20:8787';
const HEALTH = { ok: true, version: '1.0.0', coach: true, tts: false, stt: true, youtube: false, provider: 'claude-cli' };

function memorySecrets(): SecretStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: async k => map.get(k) ?? null, set: async (k, v) => { map.set(k, v); }, remove: async k => { map.delete(k); } };
}
const reply = (status: number, body: unknown): ReturnType<FetchLike> =>
  Promise.resolve({ status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

async function setup(fetchImpl: FetchLike = () => reply(200, HEALTH)) {
  const kv = createKv(null);
  const secrets = memorySecrets();
  const fetch = vi.fn(fetchImpl);
  const server = createHomeServer({ kv, secrets, fetch });
  await server.configure({ url: `${URL_}/`, token: `  ${TOKEN}\n` });
  return { kv, secrets, fetch, server, init: (n = 0) => fetch.mock.calls[n][1], url: (n = 0) => fetch.mock.calls[n][0] };
}

afterEach(() => vi.useRealTimers());

describe('validateServerConfig', () => {
  it('cleans a good config', () => {
    expect(validateServerConfig(' http://192.168.1.20:8787/ ', ` ${TOKEN} `)).toEqual({ ok: true, url: URL_, token: TOKEN });
    expect(validateServerConfig('https://my-mac.tailnet.ts.net', TOKEN)).toMatchObject({ ok: true, url: 'https://my-mac.tailnet.ts.net' });
  });
  it('explains what is wrong', () => {
    expect(validateServerConfig('192.168.1.20:8787', TOKEN)).toMatchObject({ ok: false, error: expect.stringMatching(/http:\/\//) });
    expect(validateServerConfig('http://me:pw@host:8787', TOKEN)).toMatchObject({ ok: false });
    expect(validateServerConfig('http://host:8787/?x=1', TOKEN)).toMatchObject({ ok: false });
    expect(validateServerConfig(URL_, 'short')).toMatchObject({ ok: false, error: expect.stringMatching(/at least 24/) });
    expect(validateServerConfig(URL_, 'a b'.repeat(20))).toMatchObject({ ok: false, error: expect.stringMatching(/space/) });
  });
  it('never echoes the token in an error', () => {
    const r = validateServerConfig(URL_, TOKEN.slice(0, 20));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(TOKEN.slice(0, 20));
  });
});

describe('helpers', () => {
  it('maps statuses', () => {
    expect([401, 403, 429, 500, 503, 400, 404].map(failureForStatus)).toEqual(['unauthorized', 'forbidden', 'rate-limited', 'server-error', 'server-error', 'bad-response', 'bad-response']);
  });
  it('accepts only plain /api/ paths', () => {
    for (const p of ['/api/health', '/api/settings/noteMap.e-Drum', '/api/runs/3/take', '/api/tts?text=hi%20there']) expect(safeApiPath(p), p).toBe(true);
    for (const p of ['/api//evil.com', '/api/../admin', '/api/./x', '/api/a b', '/apix', '/api\\x', 'http://x/api/']) expect(safeApiPath(p), p).toBe(false);
  });
  it('turns health into a capability', () => {
    expect(serverStatusOf({ ...HEALTH, ok: true })).toBe('reachable');
    expect(serverStatusOf({ ok: false, reason: 'not-configured' })).toBe('not-configured');
    expect(serverStatusOf({ ok: false, reason: 'unauthorized', status: 401 })).toBe('unreachable');
  });
});

describe('createHomeServer', () => {
  it('keeps the URL in the key-value store and the token only in the secret store', async () => {
    const { kv, secrets, server } = await setup();
    expect(server.configured()).toEqual({ url: URL_ });
    expect(kv.get(KV_KEYS.homeServerUrl)).toBe(URL_);
    expect(secrets.map.get(TOKEN_KEY)).toBe(TOKEN);
    for (const k of kv.keys('')) expect(kv.get(k)).not.toContain(TOKEN);
    expect(await server.hasToken()).toBe(true);
  });

  it('sends the bearer token, JSON, and no Origin', async () => {
    const { server, init, url } = await setup(() => reply(200, { id: 7 }));
    const r = await server.call<{ id: number }>('POST', '/api/coach/feedback', { a: 1 });
    expect(r).toEqual({ ok: true, data: { id: 7 } });
    expect(url()).toBe(`${URL_}/api/coach/feedback`);
    expect(init()).toMatchObject({ method: 'POST', body: '{"a":1}', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', accept: 'application/json' } });
    expect(Object.keys(init().headers).map(h => h.toLowerCase())).not.toContain('origin');
    await server.call('GET', '/api/runs');
    expect(init(1).body).toBeUndefined();
    expect(init(1).headers).not.toHaveProperty('content-type');
  });

  it('answers health with the server facts only', async () => {
    const { server, init } = await setup();
    expect(await server.health()).toEqual({ ok: true, version: '1.0.0', coach: true, tts: false, stt: true, youtube: false });
    expect(init().method).toBe('GET');
  });

  it('calls a 200 that is not Drum Coach health a bad response', async () => {
    const { server } = await setup(() => reply(200, { ok: true }));
    expect(await server.health()).toMatchObject({ ok: false, reason: 'bad-response' });
  });

  it('maps failures to typed reasons with the server error text', async () => {
    for (const [status, reason] of [[401, 'unauthorized'], [403, 'forbidden'], [429, 'rate-limited'], [500, 'server-error'], [400, 'bad-response']] as const) {
      const { server } = await setup(() => reply(status, { error: status === 400 ? 'context: larger than 50 KB' : 'Nope' }));
      const r = await server.call('GET', '/api/plan');
      expect(r, String(status)).toMatchObject({ ok: false, reason, status });
      if (status === 400) expect(r).toMatchObject({ detail: 'context: larger than 50 KB' });
    }
    const { server } = await setup(() => reply(502, '<html>bad gateway</html>'));
    expect(await server.call('GET', '/api/plan')).toEqual({ ok: false, reason: 'server-error', status: 502, detail: 'HTTP 502' });
  });

  it('says unreachable when the network fails, and bad-response for non-JSON', async () => {
    const down = await setup(() => Promise.reject(new TypeError('Network request failed')));
    expect(await down.server.health()).toMatchObject({ ok: false, reason: 'unreachable', stage: 'connect', detail: expect.stringContaining('Network request failed') });
    const html = await setup(() => reply(200, '<html>'));
    expect(await html.server.call('GET', '/api/plan')).toMatchObject({ ok: false, reason: 'bad-response' });
    const empty = await setup(() => reply(200, ''));
    expect(await empty.server.call('DELETE', '/api/lessons/x')).toEqual({ ok: true, data: null });
  });

  it('times out: 30 s by default, 200 s for coach routes (above the server\'s 180 s), or what the caller asks', async () => {
    vi.useFakeTimers();
    const hang: FetchLike = (_u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('Aborted'))));
    const { server } = await setup(hang);
    const settle = async (p: Promise<unknown>, ms: number) => {
      let done = false;
      void p.then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(ms - 1);
      const early = done;
      await vi.advanceTimersByTimeAsync(1);
      return { early, result: await p };
    };
    const plain = await settle(server.call('GET', '/api/runs'), DEFAULT_TIMEOUT_MS);
    expect(plain.early).toBe(false);
    expect(plain.result).toMatchObject({ ok: false, reason: 'unreachable', detail: expect.stringMatching(/within 30 s/) });
    const coach = await settle(server.call('POST', '/api/coach/plan', {}), COACH_TIMEOUT_MS);
    expect(coach.early).toBe(false);
    expect(coach.result).toMatchObject({ reason: 'unreachable', stage: 'answer', detail: expect.stringMatching(/within 200 s/) });
    const custom = await settle(server.call('GET', '/api/runs', undefined, { timeoutMs: 1000 }), 1000);
    expect(custom.early).toBe(false);
    expect(custom.result).toMatchObject({ reason: 'unreachable' });
  });

  it('never puts the token in error text', async () => {
    const leaky = await setup(() => Promise.reject(new Error(`failed with Authorization: Bearer ${TOKEN}`)));
    const r1 = await leaky.server.call('GET', '/api/runs');
    expect(JSON.stringify(r1)).not.toContain(TOKEN);
    const echo = await setup(() => reply(401, { error: `bad token ${TOKEN}` }));
    const r2 = await echo.server.call('GET', '/api/runs');
    expect(r2).toMatchObject({ reason: 'unauthorized' });
    expect(JSON.stringify(r2)).not.toContain(TOKEN);
  });

  it('is not configured without a URL or a token, and refuses odd paths without calling', async () => {
    const kv = createKv(null);
    const fetch = vi.fn<FetchLike>();
    const server = createHomeServer({ kv, secrets: memorySecrets(), fetch });
    expect(server.configured()).toBeNull();
    expect(await server.health()).toMatchObject({ ok: false, reason: 'not-configured' });
    kv.set(KV_KEYS.homeServerUrl, URL_); // URL but no token
    expect(await server.health()).toMatchObject({ ok: false, reason: 'not-configured', detail: expect.stringMatching(/token/) });
    await server.configure({ url: URL_, token: TOKEN });
    expect(await server.call('GET', '/api//evil.example')).toMatchObject({ ok: false, reason: 'bad-response' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores an invalid config and forgets everything on null', async () => {
    const { server, kv, secrets } = await setup();
    await server.configure({ url: 'not a url', token: 'x' });
    expect(server.configured()).toEqual({ url: URL_ });
    await server.configure(null);
    expect(server.configured()).toBeNull();
    expect(kv.get(KV_KEYS.homeServerUrl)).toBeNull();
    expect(secrets.map.has(TOKEN_KEY)).toBe(false);
    expect(await server.hasToken()).toBe(false);
  });

  it('reads the token from the secret store once, and again after a 401', async () => {
    const kv = createKv(null);
    kv.set(KV_KEYS.homeServerUrl, URL_);
    const secrets = memorySecrets();
    secrets.map.set(TOKEN_KEY, TOKEN);
    const get = vi.spyOn(secrets, 'get');
    let status = 200;
    const server = createHomeServer({ kv, secrets, fetch: () => reply(status, HEALTH) });
    await server.health();
    await server.health();
    expect(get).toHaveBeenCalledTimes(1);
    status = 401;
    await server.health();
    status = 200;
    await server.health();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('copes with a failing secret store', async () => {
    const kv = createKv(null);
    const broken: SecretStore = { get: () => Promise.reject(new Error('locked')), set: () => Promise.reject(new Error('locked')), remove: () => Promise.reject(new Error('locked')) };
    const server = createHomeServer({ kv, secrets: broken, fetch: () => reply(200, HEALTH) });
    await expect(server.configure({ url: URL_, token: TOKEN })).resolves.toBeUndefined();
    expect(await server.health()).toMatchObject({ ok: false, reason: 'not-configured' });
    await expect(server.configure(null)).resolves.toBeUndefined();
  });
});
