// Setup → Coach · home server (D2) and Coach · fallback (the Anthropic API key). The server URL lives in the key-value
// store and its token in the Keychain (src/platform/api.ts does both); Test connection asks GET /api/health and says
// how long it took. The API key is kept in the Keychain for later: the iPad's API-key coach isn't built yet.
// Pure: takes the client, the secret store and a clock; never sees or logs the token beyond passing it on.
import type { ApiFailure, HomeServer, ServerHealth } from '../../platform/contracts';
import { failureText } from '../../dev/server/model';

export type ServerClient = Pick<HomeServer, 'configure' | 'configured' | 'health'> & { hasToken(): Promise<boolean> };
type Validate = (url: string, token: string) => { ok: true; url: string; token: string } | { ok: false; error: string };

export type TestResult =
  | { ok: true; text: string; ms: number; lines: string[] }
  | { ok: false; title: string; hint: string };

function healthResult(h: ServerHealth, ms: number): TestResult {
  const lines = [h.coach ? 'Coach ready (Claude via this server)' : 'Coach not ready: run `claude` once on the server to log in'];
  if (!h.tts) lines.push('Voice: the iPad’s own (no Piper on the server)');
  return { ok: true, text: `Connected · ${Math.round(ms)} ms`, ms, lines };
}

/** GET /api/health, timed. */
export async function testConnection(client: Pick<HomeServer, 'health'>, now: () => number): Promise<TestResult> {
  const t0 = now();
  const r: ServerHealth | ApiFailure = await client.health();
  if (r.ok) return healthResult(r, now() - t0);
  return { ok: false, ...failureText(r) };
}

/**
 * Save then test (the screen's Save): checks what was typed, stores the URL and token, and tests. Returns the error
 * to show instead when the input is wrong.
 */
export async function saveServer(client: ServerClient, validate: Validate, url: string, token: string, now: () => number): Promise<{ error: string } | TestResult> {
  // The token is never read back into the form, so a new address needs the token pasted again.
  if (!token.trim() && await client.hasToken()) {
    return { error: 'Paste the token again to change the address (the saved one stays until then).' };
  }
  const v = validate(url, token);
  if (!v.ok) return { error: v.error };
  await client.configure({ url: v.url, token: v.token });
  return testConnection(client, now);
}

export async function forgetServer(client: Pick<HomeServer, 'configure'>): Promise<void> {
  await client.configure(null);
}

/** The token field's display: dots when one is saved, never the token. */
export const tokenMask = (saved: boolean) => (saved ? '••••••••••••••••' : 'Not set');

export const SERVER_FOOT = 'Your laptop runs the coach with your Claude subscription. Same Wi-Fi or Tailscale.';
export const SERVER_PLACEHOLDER = 'http://drum-laptop.local:8787';

// ---- Coach · fallback: the Anthropic API key ----

export type SecretStore = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void> };
/** The Keychain key (a later API-key coach reads it from here). */
export const API_KEY_SECRET = 'drumcoach.anthropic.apiKey';

/** An Anthropic key: "sk-ant-…", no spaces. Returns the cleaned key or what's wrong. */
export function validateApiKey(input: string): { ok: true; key: string } | { ok: false; error: string } {
  const k = input.trim();
  if (!k) return { ok: false, error: 'Paste the key from console.anthropic.com' };
  if (/\s/.test(k)) return { ok: false, error: 'The key has a space or line break in it; copy it again' };
  if (!k.startsWith('sk-ant-') || k.length < 20) return { ok: false, error: 'An Anthropic API key starts with sk-ant-' };
  return { ok: true, key: k };
}

export async function saveApiKey(secrets: SecretStore, input: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = validateApiKey(input);
  if (!v.ok) return v;
  await secrets.set(API_KEY_SECRET, v.key);
  return { ok: true };
}

export const removeApiKey = (secrets: SecretStore) => secrets.remove(API_KEY_SECRET);
export const hasApiKey = async (secrets: SecretStore) => !!(await secrets.get(API_KEY_SECRET));

/** The row's value: "Not set" / "Set · used later". */
export const apiKeyValue = (set: boolean) => (set ? 'Set · used later' : 'Not set');
/** The web's way of saying a path isn't built yet: plain, under the row. */
export const API_KEY_FOOT = 'Used only when the server can’t be reached. Each question sends a short summary of your takes, never audio or raw MIDI. '
  + 'Coming later: the iPad doesn’t call the API yet, so for now the coach needs your home server. The key waits in the Keychain until then.';
