import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askUntilAnswered, deadline, DomCallTimeout, fontOrTimeout, withTimeout } from './domCalls';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('calls from a DOM page to native that may never answer', () => {
  it('passes an answer through and rejects a dropped one after the deadline', async () => {
    await expect(withTimeout(Promise.resolve(5), 1000)).resolves.toBe(5);
    const dropped = withTimeout(new Promise<number>(() => {}), 1000);
    const seen = expect(dropped).rejects.toBeInstanceOf(DomCallTimeout);
    await vi.advanceTimersByTimeAsync(1000);
    await seen;
  });

  it('a failure stays a failure (not a timeout)', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });

  it('deadline wraps a native action', async () => {
    let n = 0;
    const clockNow = deadline(async () => ++n, 500);
    await expect(clockNow()).resolves.toBe(1);
    const never = deadline(() => new Promise<number>(() => {}), 500)();
    const seen = expect(never).rejects.toBeInstanceOf(DomCallTimeout);
    await vi.advanceTimersByTimeAsync(500);
    await seen;
  });

  it('asks again until answered, and stops when the caller is gone', async () => {
    let calls = 0;
    const ask = () => (++calls < 3 ? Promise.reject(new DomCallTimeout(1)) : Promise.resolve('batch'));
    await expect(askUntilAnswered(ask, { tries: 5, gapMs: 10, live: () => true, sleep: async () => {} })).resolves.toBe('batch');
    expect(calls).toBe(3);
    calls = 0;
    await expect(askUntilAnswered(() => { calls++; return Promise.reject(new Error('x')); }, { tries: 3, gapMs: 10, live: () => true, sleep: async () => {} })).resolves.toBeUndefined();
    expect(calls).toBe(3);
    calls = 0;
    await expect(askUntilAnswered(() => { calls++; return Promise.resolve(1); }, { tries: 3, gapMs: 10, live: () => false })).resolves.toBeUndefined();
    expect(calls).toBe(0);
  });

  it('the font: drawn when loaded, failed or slow', async () => {
    await expect(fontOrTimeout(() => Promise.resolve([]), 1500)).resolves.toBeUndefined();
    await expect(fontOrTimeout(() => Promise.reject(new Error('no font')), 1500)).resolves.toBeUndefined();
    await expect(fontOrTimeout(() => { throw new Error('sync'); }, 1500)).resolves.toBeUndefined();
    const slow = fontOrTimeout(() => new Promise(() => {}), 1500);
    await vi.advanceTimersByTimeAsync(1500);
    await expect(slow).resolves.toBeUndefined();
  });
});
