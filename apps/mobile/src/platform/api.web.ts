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
  instance = seedFor(harnessState()).coachHangs
    ? { ...client, configured: () => ({ url: 'http://harness.local:8787' }) as never, call: () => new Promise(() => {}) }
    : client;
  return instance;
}

export { serverStatusOf, validateServerConfig, MIN_TOKEN_LENGTH } from '../data/homeServer';
export type { HomeServerClient, HomeServerEvent, StreamResult } from '../data/homeServer';
