import { describe, expect, it, vi } from 'vitest';
import { createKeepAwake, keepAwakeWhileForeground, type AppStateLike } from './keepAwakeCore';

const fakeNative = () => ({ activate: vi.fn(async () => {}), deactivate: vi.fn(async () => {}) });

function fakeAppState(initial: string): AppStateLike & { set(state: string): void; listeners: number } {
  const fns = new Set<(s: string) => void>();
  return {
    currentState: initial,
    addEventListener: (_type, fn) => {
      fns.add(fn);
      return { remove: () => fns.delete(fn) };
    },
    set(state) {
      this.currentState = state;
      for (const fn of fns) fn(state);
    },
    get listeners() {
      return fns.size;
    },
  };
}

describe('createKeepAwake', () => {
  it('activates and deactivates each tag once', () => {
    const native = fakeNative();
    const ka = createKeepAwake(native);
    ka.activate('take');
    ka.activate('take');
    ka.activate('app');
    expect(native.activate.mock.calls).toEqual([['take'], ['app']]);
    ka.deactivate('take');
    ka.deactivate('take');
    ka.deactivate('never');
    expect(native.deactivate.mock.calls).toEqual([['take']]);
    expect(ka.active()).toEqual(['app']);
  });

  it('logs native failures instead of throwing', async () => {
    const log = vi.fn();
    const ka = createKeepAwake({ activate: () => Promise.reject(new Error('no activity')), deactivate: () => { throw new Error('boom'); } }, log);
    expect(() => ka.activate('x')).not.toThrow();
    expect(() => ka.deactivate('x')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toHaveBeenCalledTimes(2);
  });
});

describe('keepAwakeWhileForeground', () => {
  it('holds the tag only while active, and releases it on stop', () => {
    const native = fakeNative();
    const ka = createKeepAwake(native);
    const app = fakeAppState('active');
    const stop = keepAwakeWhileForeground(ka, 'app', app);
    expect(ka.active()).toEqual(['app']);
    app.set('inactive');
    expect(ka.active()).toEqual([]);
    app.set('background');
    app.set('active');
    expect(ka.active()).toEqual(['app']);
    expect(native.activate).toHaveBeenCalledTimes(2);
    stop();
    expect(ka.active()).toEqual([]);
    expect(app.listeners).toBe(0);
  });

  it('starts released when launched in the background', () => {
    const ka = createKeepAwake(fakeNative());
    keepAwakeWhileForeground(ka, 'app', fakeAppState('background'));
    expect(ka.active()).toEqual([]);
  });
});
