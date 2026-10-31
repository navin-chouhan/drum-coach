import { afterEach, describe, expect, it, vi } from 'vitest';
import { COACH_TIMEOUT_MS, createHomeServer, TOKEN_KEY, type FetchInit, type HomeServerEvent, type StreamFetchLike, type StreamResponse } from './homeServer';
import { createKv, KV_KEYS } from './kv';

const TOKEN = 'fake-test-token-'.padEnd(36, 'x'); // obviously fake, low entropy: secret scanners leave it alone
const URL_ = 'http://192.168.1.20:8787';
const SERVER = 'event: say\ndata: "Nice ✓ and even"\n\nevent: reply\ndata: {"say":"Nice ✓ and even","screen":"Relax 🥁"}\n\n';

/** A response whose body yields `chunks`, then ends, or `hang`s until the request is aborted (like expo/fetch). */
function streamed(init: FetchInit, chunks: Uint8Array[], o: { status?: number; type?: string; hang?: boolean; breakAfter?: boolean; text?: string } = {}): StreamResponse {
  let i = 0;
  const cancel = vi.fn(async () => {});
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) { controller.enqueue(chunks[i++]); return; }
      if (o.breakAfter) { controller.error(new TypeError('The network connection was lost.')); return; }
      if (!o.hang) { controller.close(); return; }
      return new Promise<void>(resolve => {
        const stop = () => { controller.error(new Error('The operation was aborted.')); resolve(); };
        if (init.signal.aborted) stop(); else init.signal.addEventListener('abort', stop);
      });
    },
    cancel,
  });
  return {
    status: o.status ?? 200,
    headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? o.type ?? 'text/event-stream' : null) },
    body: { getReader: () => { const r = body.getReader(); return { read: () => r.read(), cancel: async (why?: unknown) => { await cancel(); await r.cancel(why); } }; } },
    text: async () => o.text ?? '',
    cancel,
  } as StreamResponse & { cancel: typeof cancel };
}
const bytes = (s: string) => new TextEncoder().encode(s);
/** SERVER as bytes cut every `n` bytes, so multi-byte characters split across chunks. */
const cut = (s: string, n: number) => { const b = bytes(s); const out: Uint8Array[] = []; for (let i = 0; i < b.length; i += n) out.push(b.subarray(i, i + n)); return out; };

async function setup(streamFetch?: StreamFetchLike) {
  const kv = createKv(null);
  const map = new Map<string, string>([[TOKEN_KEY, TOKEN]]);
  kv.set(KV_KEYS.homeServerUrl, URL_);
  const sf = streamFetch && vi.fn(streamFetch);
  const server = createHomeServer({
    kv, fetch: vi.fn(), streamFetch: sf,
    secrets: { get: async k => map.get(k) ?? null, set: async () => {}, remove: async () => {} },
  });
  const events: HomeServerEvent[] = [];
  return { server, sf, events, onEvent: (e: HomeServerEvent) => events.push(e) };
}

afterEach(() => vi.useRealTimers());

describe('HomeServer.stream', () => {
  it('delivers the session events in order, with JSON parsed, however the bytes are split', async () => {
    for (const n of [1, 3, 7, 1000]) {
      const { server, sf, events, onEvent } = await setup((_u, init) => Promise.resolve(streamed(init, cut(SERVER, n))));
      const r = await server.stream('/api/coach/session', { type: 'open', context: {} }, onEvent);
      expect(r, String(n)).toEqual({ ok: true, events: 2 });
      expect(events).toEqual([
        { event: 'say', data: '"Nice ✓ and even"', json: 'Nice ✓ and even' },
        { event: 'reply', data: '{"say":"Nice ✓ and even","screen":"Relax 🥁"}', json: { say: 'Nice ✓ and even', screen: 'Relax 🥁' } },
      ]);
      const [url, init] = sf!.mock.calls[0];
      expect(url).toBe(`${URL_}/api/coach/session`);
      expect(init).toMatchObject({ method: 'POST', body: '{"type":"open","context":{}}', headers: { authorization: `Bearer ${TOKEN}`, accept: 'text/event-stream', 'content-type': 'application/json' } });
      expect(Object.keys(init.headers).map(h => h.toLowerCase())).not.toContain('origin');
    }
  });

  it('passes an event that is not JSON through as data only', async () => {
    const { server, events, onEvent } = await setup((_u, init) => Promise.resolve(streamed(init, [bytes('data: plain text\n\n')])));
    expect(await server.stream('/api/coach/session', {}, onEvent)).toEqual({ ok: true, events: 1 });
    expect(events).toEqual([{ event: 'message', data: 'plain text' }]);
  });

  it('maps HTTP failures like call does', async () => {
    for (const [status, reason] of [[401, 'unauthorized'], [403, 'forbidden'], [429, 'rate-limited'], [500, 'server-error'], [400, 'bad-response']] as const) {
      const { server, events, onEvent } = await setup((_u, init) => Promise.resolve(streamed(init, [], { status, type: 'application/json', text: '{"error":"context: too big"}' })));
      expect(await server.stream('/api/coach/session', {}, onEvent), String(status)).toEqual({ ok: false, reason, status, detail: 'context: too big' });
      expect(events).toEqual([]);
    }
  });

  it('calls a 200 that is not an event stream a bad response', async () => {
    const { server, onEvent } = await setup((_u, init) => Promise.resolve(streamed(init, [bytes('{}')], { type: 'application/json' })));
    expect(await server.stream('/api/coach/session', {}, onEvent)).toMatchObject({ ok: false, reason: 'bad-response', status: 200 });
  });

  it('says unreachable when the request fails or the stream breaks off', async () => {
    const down = await setup(() => Promise.reject(new TypeError('Network request failed')));
    expect(await down.server.stream('/api/coach/session', {}, down.onEvent)).toMatchObject({ ok: false, reason: 'unreachable' });
    const broken = await setup((_u, init) => Promise.resolve(streamed(init, [bytes('event: say\ndata: "a"\n\n')], { breakAfter: true })));
    expect(await broken.server.stream('/api/coach/session', {}, broken.onEvent)).toMatchObject({ ok: false, reason: 'unreachable', detail: expect.stringMatching(/broke off/) });
    expect(broken.events).toHaveLength(1); // what arrived before the break was delivered
  });

  it('times out the whole stream (200 s for coach routes, or what the caller asks)', async () => {
    vi.useFakeTimers();
    const { server, events, onEvent } = await setup((_u, init) => Promise.resolve(streamed(init, [bytes('event: say\ndata: "hi"\n\n')], { hang: true })));
    const p = server.stream('/api/coach/session', {}, onEvent);
    let done = false;
    void p.then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(COACH_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    expect(events).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toMatchObject({ ok: false, reason: 'unreachable', stage: 'answer', detail: expect.stringMatching(/stopped after 200 s/) });
    const short = server.stream('/api/coach/session', {}, onEvent, { timeoutMs: 2000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await short).toMatchObject({ ok: false, reason: 'unreachable' });
  });

  it('stops when the caller aborts, and says so', async () => {
    const { server, events, onEvent } = await setup((_u, init) => Promise.resolve(streamed(init, [bytes('event: say\ndata: "hi"\n\n')], { hang: true })));
    const ac = new AbortController();
    const p = server.stream('/api/coach/session', {}, e => { onEvent(e); ac.abort(); }, { signal: ac.signal });
    expect(await p).toEqual({ ok: true, events: 1, cancelled: true });
    expect(events).toHaveLength(1);
    const before = new AbortController();
    before.abort();
    expect(await server.stream('/api/coach/session', {}, onEvent, { signal: before.signal })).toEqual({ ok: true, events: 0, cancelled: true });
  });

  it('stops and reports a failing event handler', async () => {
    const chunks = [bytes('event: say\ndata: "a"\n\n'), bytes('event: say\ndata: "b"\n\n')];
    let res: (StreamResponse & { cancel: () => Promise<void> }) | undefined;
    const { server } = await setup((_u, init) => { res = streamed(init, chunks, { hang: true }) as typeof res; return Promise.resolve(res!); });
    let calls = 0;
    const r = await server.stream('/api/coach/session', {}, () => { calls++; throw new Error('render failed'); });
    expect(r).toEqual({ ok: false, reason: 'bad-response', detail: 'The event handler failed: render failed' });
    expect(calls).toBe(1);
    expect(res!.cancel).toHaveBeenCalled();
  });

  it('never puts the token in error text', async () => {
    const { server, onEvent } = await setup(() => Promise.reject(new Error(`refused: Bearer ${TOKEN}`)));
    expect(JSON.stringify(await server.stream('/api/coach/session', {}, onEvent))).not.toContain(TOKEN);
  });

  it('fails cleanly without a stream fetch, an address or a safe path', async () => {
    const none = await setup();
    expect(await none.server.stream('/api/coach/session', {}, none.onEvent)).toMatchObject({ ok: false, reason: 'bad-response' });
    const { server, sf, onEvent } = await setup(() => Promise.reject(new Error('should not be called')));
    expect(await server.stream('/api/../x' as `/api/${string}`, {}, onEvent)).toMatchObject({ ok: false, reason: 'bad-response' });
    await server.configure(null);
    expect(await server.stream('/api/coach/session', {}, onEvent)).toMatchObject({ ok: false, reason: 'not-configured' });
    expect(sf).not.toHaveBeenCalled();
  });
});
