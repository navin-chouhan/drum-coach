// HomeServer on the web: the layout harness only (scripts/screenshots.mjs). No server: every call fails as
// unreachable, except in the `writing` state, where coach calls never answer (the "coach is writing" screens).
// Metro picks this file for `--platform web` only.
import { createHomeServer, type HomeServerClient, type SecretStore } from '../data/homeServer';
import { harnessState, seedFor } from '../dev/harness/seeds';
import { getStorage } from './storage';

const memory = new Map<string, string>();
const secrets: SecretStore = {
  get: async key => memory.get(key) ?? null,
  set: async (key, value) => { memory.set(key, value); },
  remove: async key => { memory.delete(key); },
};

let instance: HomeServerClient | null = null;

export function getHomeServer(): HomeServerClient {
  if (instance) return instance;
  const offline = () => Promise.reject(new TypeError('web harness: no server'));
  const client = createHomeServer({ kv: getStorage().kv, secrets, fetch: offline, streamFetch: offline });
  const seed = seedFor(harnessState());
  instance = seed.coachHangs
    ? { ...client, configured: () => ({ url: 'http://harness.local:8787' }) as never, call: () => new Promise(() => {}) }
    : seed.coachAnswers ? answering(client) : client;
  return instance;
}

/** The `coach` state: a healthy server whose coach answers every session event with one canned (fake) reply. */
function answering(client: HomeServerClient): HomeServerClient {
  const reply = { say: 'Nice and even. Bar 2 still rushes a little: count it out loud once, then play it again at 70.', action: { kind: 'again' as const, label: 'Again at 70', bpm: 70 } };
  return {
    ...client,
    configured: () => ({ url: 'http://harness.local:8787' }) as never,
    hasToken: async () => true,
    health: async () => ({ ok: true, version: 'harness', coach: true, tts: false, stt: false, youtube: false }) as never,
    stream: async (_path, _body, onEvent) => {
      onEvent({ event: 'say', data: '', json: reply.say } as never);
      onEvent({ event: 'reply', data: '', json: reply } as never);
      return { ok: true, events: 2 };
    },
  };
}

export { serverStatusOf, validateServerConfig, MIN_TOKEN_LENGTH } from '../data/homeServer';
export type { HomeServerClient, HomeServerEvent, StreamResult } from '../data/homeServer';
