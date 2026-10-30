// HomeServer (contracts.ts) on React Native's fetch, expo/fetch (for streams) and expo-secure-store. The logic is in
// src/data/homeServer.ts (tested in Node). The token is stored in the Keychain for this device only (not in backups,
// not synced to other devices) and readable only while the iPad is unlocked, which is the only time the app calls
// the server.
import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import { createHomeServer, type FetchLike, type HomeServerClient, type SecretStore, type StreamFetchLike } from '../data/homeServer';
import { getStorage } from './storage';

const KEYCHAIN: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const secrets: SecretStore = {
  get: key => SecureStore.getItemAsync(key, KEYCHAIN),
  set: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN),
  remove: key => SecureStore.deleteItemAsync(key, KEYCHAIN),
};

const rnFetch: FetchLike = (url, init) => fetch(url, init);
// React Native's own fetch buffers the whole body; expo/fetch (expo 58: src/winter/fetch) streams it through
// `response.body.getReader()`, which server-sent events need. credentials 'omit': the server never sets cookies.
const streamFetch: StreamFetchLike = (url, init) => expoFetch(url, { ...init, credentials: 'omit' });

let instance: HomeServerClient | null = null;

/** The app's home-server client (the URL in storage's key-value store, the token in the Keychain). */
export function getHomeServer(): HomeServerClient {
  instance ??= createHomeServer({ kv: getStorage().kv, secrets, fetch: rnFetch, streamFetch });
  return instance;
}

export { serverStatusOf, validateServerConfig, MIN_TOKEN_LENGTH } from '../data/homeServer';
export type { HomeServerClient, HomeServerEvent, StreamResult } from '../data/homeServer';
