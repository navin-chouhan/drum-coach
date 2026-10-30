// Test helpers for the coach models: a synthetic take, a fake home server and a memory key-value store.
import type { KeyValueStore } from '@drum-coach/core/platform';
import type { ApiFailure, HomeServerEvent, ServerHealth, StreamResult } from '../../platform/contracts';
import type { SessionTake } from './session';

export function fakeTake(over: { startedAt?: string; total?: number; title?: string; id?: string; bpm?: number } = {}): SessionTake {
  const total = over.total ?? 48;
  const heat = Array.from({ length: 16 }, (_, i) => ({ total: i % 2 ? 0 : 6, miss: i === 4 ? 3 : i === 8 ? 1 : 0, meanAbsOffset: i === 4 ? 60 : 12 }));
  return {
    startedAt: over.startedAt ?? '2026-10-30T19:40:00.000Z',
    chart: { ...(over.id && { id: over.id }), title: over.title ?? 'The money beat', bpm: 80, timeSignature: [4, 4], bars: 4, level: 2, kind: 'groove', notes: [{ t: 0, drum: 'kick' }, { t: 0, drum: 'hihat' }, { t: 1, drum: 'snare' }] },
    options: { speed: (over.bpm ?? 70) / 80, fromBar: 1, toBar: 4, repeats: 1 } as unknown as SessionTake['options'],
    run: { notes: [], beats: 16, beatsPerBar: 4 },
    cues: [{ id: 'rushing', text: 'Rushing by 30 ms. Sit back on the click', spoken: 'Rushing. Sit back', priority: 70 }],
    stats: {
      total, perfect: 40, good: 6, miss: 2, extra: 1, accuracy: 96, meanOffset: -18, spread: 14,
      perDrum: { kick: { total: 16, hit: 15, accuracy: 94, meanOffset: -40 }, snare: { total: 8, hit: 8, accuracy: 100, meanOffset: 2 } },
      velocity: { normalMean: 80, normalCv: 10, accentMean: null, ghostMean: null, pairDrop: null }, flam: null, heat, streak: 21, recoveries: 1,
    },
  };
}

export function memoryKv(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: k => map.get(k) ?? null, set: (k, v) => { map.set(k, v); }, remove: k => { map.delete(k); } };
}

const sse = (event: string, json: unknown): HomeServerEvent => ({ event, data: JSON.stringify(json), json });
export const sayEvent = (s: string) => sse('say', s);
export const replyEvent = (r: unknown) => sse('reply', r);
export const errorEvent = (error: string) => sse('error', { error });

/** A home server whose answers the test sets: `calls` / `streams` record what was sent. */
export function fakeServer(o: { url?: string } = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const streams: { path: string; body: Record<string, unknown> }[] = [];
  let callAnswer: (path: string, body: unknown) => Promise<{ ok: true; data: unknown } | ApiFailure> = async () => ({ ok: true, data: {} });
  let streamAnswer: (body: Record<string, unknown>) => { events: HomeServerEvent[]; result?: StreamResult } = () => ({ events: [] });
  let health: ServerHealth | ApiFailure = { ok: true, version: '1', coach: true, tts: false, stt: false, youtube: false };
  const url = o.url ?? 'http://drum-laptop.local:8787';
  return {
    calls, streams,
    answerCalls(fn: typeof callAnswer) { callAnswer = fn; },
    answerStreams(fn: typeof streamAnswer) { streamAnswer = fn; },
    setHealth(h: ServerHealth | ApiFailure) { health = h; },
    server: {
      configured: () => ({ url }),
      health: async () => health,
      async call<T>(method: string, path: string, body?: unknown) {
        calls.push({ method, path, body });
        return (await callAnswer(path, body)) as { ok: true; data: T } | ApiFailure;
      },
      async stream(path: string, body: unknown, onEvent: (e: HomeServerEvent) => void): Promise<StreamResult> {
        streams.push({ path, body: body as Record<string, unknown> });
        const a = streamAnswer(body as Record<string, unknown>);
        for (const e of a.events) onEvent(e);
        await Promise.resolve();
        return a.result ?? { ok: true, events: a.events.length };
      },
    },
  };
}

export const unreachable: ApiFailure = { ok: false, reason: 'unreachable', detail: 'No answer from http://drum-laptop.local:8787 within 10 s' };
