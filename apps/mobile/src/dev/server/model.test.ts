import { describe, expect, it } from 'vitest';
import type { ApiFailure } from '../../platform/contracts';
import { failureText, healthLines } from './model';

describe('healthLines', () => {
  it('lists each feature with a tone', () => {
    const lines = healthLines({ ok: true, version: '1.2.0', coach: true, tts: false, stt: true, youtube: false });
    expect(lines.map(l => [l.label, l.tone])).toEqual([
      ['Server', 'ok'], ['Coach', 'ok'], ['Voice (Piper)', 'warn'], ['Listening (Whisper)', 'ok'], ['YouTube search', 'warn'],
    ]);
    expect(lines[0].value).toBe('Drum Coach 1.2.0');
  });
});

describe('failureText', () => {
  it('has a title and a hint for every reason', () => {
    const reasons: ApiFailure['reason'][] = ['not-configured', 'unreachable', 'unauthorized', 'forbidden', 'rate-limited', 'bad-response', 'server-error'];
    for (const reason of reasons) {
      const t = failureText({ ok: false, reason });
      expect(t.title.length, reason).toBeGreaterThan(3);
      expect(t.hint.length, reason).toBeGreaterThan(10);
    }
  });
  it('adds the status and detail', () => {
    expect(failureText({ ok: false, reason: 'forbidden', status: 403, detail: 'Forbidden' }).title).toBe('Address not allowed (HTTP 403): Forbidden');
    expect(failureText({ ok: false, reason: 'forbidden' }).hint).toMatch(/ALLOWED_HOSTS/);
  });
});
