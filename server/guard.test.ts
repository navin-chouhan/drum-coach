import { describe, expect, it } from 'vitest';
import { allowedRequest, childEnv } from './guard';

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

describe('child process environment', () => {
  it("drops this app's secrets and keeps the rest", () => {
    const env = childEnv({ PATH: '/usr/bin', HOME: '/home/me', ANTHROPIC_API_KEY: 'sk-ant-x', YOUTUBE_API_KEY: 'AIza-x' });
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/me' });
  });
});
