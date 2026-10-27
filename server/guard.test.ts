import { describe, expect, it } from 'vitest';
import { allowedRequest, childEnv, looksLikeAudio } from './guard';

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

describe('audio uploads', () => {
  const pad = (head: number[] | string) => Buffer.concat([typeof head === 'string' ? Buffer.from(head, 'latin1') : Buffer.from(head), Buffer.alloc(32)]);
  it('accepts the formats the app takes, by their first bytes', () => {
    expect(looksLikeAudio(pad('ID3\x04'), 'mp3')).toBe(true);
    expect(looksLikeAudio(pad([0xff, 0xfb, 0x90]), 'mp3')).toBe(true); // an MP3 frame without a tag
    expect(looksLikeAudio(pad('OggS'), 'ogg')).toBe(true);
    expect(looksLikeAudio(pad('RIFF\0\0\0\0WAVEfmt '), 'wav')).toBe(true);
    expect(looksLikeAudio(pad('fLaC'), 'flac')).toBe(true);
    expect(looksLikeAudio(pad('\0\0\0\x20ftypM4A '), 'm4a')).toBe(true);
    expect(looksLikeAudio(pad([0xff, 0xf1]), 'aac')).toBe(true);
    expect(looksLikeAudio(pad([0x1a, 0x45, 0xdf, 0xa3]), 'webm')).toBe(true);
  });
  it('refuses anything else, whatever its Content-Type said', () => {
    expect(looksLikeAudio(pad('<html><script>'), 'mp3')).toBe(false);
    expect(looksLikeAudio(pad('OggS'), 'wav')).toBe(false); // a different format than claimed
    expect(looksLikeAudio(pad('RIFF\0\0\0\0AVI '), 'wav')).toBe(false);
    expect(looksLikeAudio(Buffer.from('RIFF'), 'wav')).toBe(false); // too short to be a file
    expect(looksLikeAudio(pad('ID3'), 'exe')).toBe(false);
  });
});

describe('child process environment', () => {
  it("drops this app's secrets and keeps the rest", () => {
    const env = childEnv({ PATH: '/usr/bin', HOME: '/home/me', ANTHROPIC_API_KEY: 'sk-ant-x', YOUTUBE_API_KEY: 'AIza-x' });
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/home/me' });
  });
});
