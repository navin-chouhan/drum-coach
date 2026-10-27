// Who may call the local API: this app's own pages (through Vite's proxy) and local tools such as the play test.
// - Host blocks DNS rebinding (a website whose name points at 127.0.0.1).
// - Origin blocks pages from other origins on writes.
// - Sec-Fetch-Site blocks other websites, and pages on other localhost ports, on every request: browsers send it even
//   on a plain <img> or no-cors GET, which carry no Origin. curl and Node's fetch don't send it.
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

// The helpers this server starts (the claude CLI, Piper, Whisper through uv) get its environment without its secrets:
// none of them needs the keys, and a bad release of one of their Python packages would otherwise get both.
const SECRETS = ['ANTHROPIC_API_KEY', 'YOUTUBE_API_KEY'];
export function childEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const k of SECRETS) delete out[k];
  return out;
}
