// HomeServer (contracts.ts) on React Native's fetch and expo-secure-store. The logic is in src/data/homeServer.ts
// (tested in Node). The token is stored in the Keychain for this device only (not in backups, not synced to other
// devices) and readable only while the iPad is unlocked, which is the only time the app calls the server.
import * as SecureStore from 'expo-secure-store';
import { createHomeServer, type FetchLike, type HomeServerClient, type SecretStore } from '../data/homeServer';
import { getStorage } from './storage';

const KEYCHAIN: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

const secrets: SecretStore = {
  get: key => SecureStore.getItemAsync(key, KEYCHAIN),
  set: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN),
  remove: key => SecureStore.deleteItemAsync(key, KEYCHAIN),
};

const rnFetch: FetchLike = (url, init) => fetch(url, init);

let instance: HomeServerClient | null = null;

/** The app's home-server client (the URL in storage's key-value store, the token in the Keychain). */
export function getHomeServer(): HomeServerClient {
  instance ??= createHomeServer({ kv: getStorage().kv, secrets, fetch: rnFetch });
  return instance;
}

export { serverStatusOf, validateServerConfig, MIN_TOKEN_LENGTH } from '../data/homeServer';
