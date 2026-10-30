import { describe, expect, it, vi } from 'vitest';
import { buildCapabilities, normalizeServerUrl, probeCoachServer } from './capabilitiesCore';

const reply = (ok: boolean, body: unknown) => vi.fn(async () => ({ ok, json: async () => body }));

describe('buildCapabilities', () => {
  it('never offers tab capture, and marks a missing server as not configured', () => {
    expect(buildCapabilities({ midiModulePresent: true, coachServerUrl: null })).toEqual({
      midi: true,
      tabCapture: false,
      coachServer: 'not-configured',
    });
    expect(buildCapabilities({ midiModulePresent: false, coachServerUrl: 'http://192.168.1.20:8787' }).coachServer).toBe('unknown');
  });
});

describe('normalizeServerUrl', () => {
  it('keeps http(s) URLs without trailing slashes and rejects the rest', () => {
    expect(normalizeServerUrl(' http://mac.local:8787/ ')).toBe('http://mac.local:8787');
    expect(normalizeServerUrl('https://box.tailnet.ts.net')).toBe('https://box.tailnet.ts.net');
    expect(normalizeServerUrl('ftp://x')).toBeNull();
    expect(normalizeServerUrl('')).toBeNull();
    expect(normalizeServerUrl(null)).toBeNull();
  });
});

describe('probeCoachServer', () => {
  it('is reachable only for { ok: true } from /api/health', async () => {
    const f = reply(true, { ok: true, provider: 'claude-cli' });
    expect(await probeCoachServer('http://10.0.0.2:8787/', f)).toBe('reachable');
    expect(f).toHaveBeenCalledWith('http://10.0.0.2:8787/api/health', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(await probeCoachServer('http://10.0.0.2:8787', reply(true, { ok: false }))).toBe('unreachable');
    expect(await probeCoachServer('http://10.0.0.2:8787', reply(false, { ok: true }))).toBe('unreachable');
  });

  it('turns errors and timeouts into unreachable, and no URL into not-configured', async () => {
    expect(await probeCoachServer('http://10.0.0.2:8787', vi.fn(async () => { throw new TypeError('Network request failed'); }))).toBe('unreachable');
    const hang = vi.fn((_url: string, init: { signal: AbortSignal }) => new Promise<never>((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    expect(await probeCoachServer('http://10.0.0.2:8787', hang, 10)).toBe('unreachable');
    expect(await probeCoachServer(undefined, hang)).toBe('not-configured');
  });
});
