import { createFakeAudioPort, createFakeClock } from '@drum-coach/core/play/fakeAudio';
import { describe, expect, it, vi } from 'vitest';
import { IDLE_MS, createAudioKeeper, watchInterruptions, withKeeper, type AppStateLike } from './audioLifecycle';

function fakeTimers() {
  let now = 0, next = 1;
  const due = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimer: (fn: () => void, ms: number) => { const id = next++; due.set(id, { at: now + ms, fn }); return id; },
    clearTimer: (id: unknown) => { due.delete(id as number); },
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...due]) if (t.at <= now) { due.delete(id); t.fn(); }
    },
    pending: () => due.size,
  };
}

function fakePort() {
  return { available: true, start: vi.fn(() => Promise.resolve({} as never)), suspend: vi.fn() };
}

describe('watchInterruptions', () => {
  it('passes the native time of a route change (M1) and of a call; AppState has none', () => {
    const port = createFakeAudioPort(createFakeClock()), fn = vi.fn();
    const fns = new Set<(s: string) => void>();
    const app: AppStateLike = { addEventListener: (_t, f) => { fns.add(f); return { remove: () => { fns.delete(f); } }; } };
    const off = watchInterruptions(port, app, fn);
    port.emitInterruption({ type: 'engine-stopped', at: 777, cause: 'route-change' });
    port.emitInterruption({ type: 'began', at: 900 });
    fns.forEach(f => f('background'));
    expect(fn.mock.calls).toEqual([[777], [900], []]);
    off();
    expect(fns.size).toBe(0);
  });
});

describe('the audio keeper (M2, m5)', () => {
  it('a play screen starts the engine at once and keeps it; 60 s after the last one leaves, it is suspended', () => {
    const t = fakeTimers(), port = fakePort();
    const k = createAudioKeeper({ port, setTimer: t.setTimer, clearTimer: t.clearTimer });
    const release = k.hold();
    expect(port.start).toHaveBeenCalledTimes(1);
    t.advance(10 * IDLE_MS);
    expect(port.suspend).not.toHaveBeenCalled(); // held: never suspended
    release();
    release(); // twice is once
    expect(k.holds).toBe(0);
    t.advance(IDLE_MS - 1);
    expect(port.suspend).not.toHaveBeenCalled();
    t.advance(1);
    expect(port.suspend).toHaveBeenCalledTimes(1);
    expect(k.suspended).toBe(true);
  });

  it('sounds keep it awake; a sound after a suspend starts it again', () => {
    const t = fakeTimers(), raw = fakePort();
    const k = createAudioKeeper({ port: raw, setTimer: t.setTimer, clearTimer: t.clearTimer });
    const base = createFakeAudioPort(createFakeClock());
    const audio = withKeeper(base, k);
    audio.schedule([]);
    t.advance(IDLE_MS / 2);
    audio.playNow('drum.snare', 1);
    t.advance(IDLE_MS / 2);
    expect(raw.suspend).not.toHaveBeenCalled(); // the tap re-armed the idle time
    t.advance(IDLE_MS / 2);
    expect(raw.suspend).toHaveBeenCalledTimes(1);
    expect(raw.start).not.toHaveBeenCalled();
    audio.playNow('drum.snare', 1);
    expect(raw.start).toHaveBeenCalledTimes(1);
    expect(k.suspended).toBe(false);
  });

  it('coming back to the foreground starts the engine again only while a screen holds it', () => {
    const t = fakeTimers(), port = fakePort();
    const k = createAudioKeeper({ port, setTimer: t.setTimer, clearTimer: t.clearTimer });
    k.foreground();
    expect(port.start).not.toHaveBeenCalled();
    const release = k.hold();
    k.foreground();
    expect(port.start).toHaveBeenCalledTimes(2);
    release();
  });

  it('does nothing without the audio module', () => {
    const t = fakeTimers(), port = { ...fakePort(), available: false };
    const k = createAudioKeeper({ port, setTimer: t.setTimer, clearTimer: t.clearTimer });
    k.hold()();
    k.activity();
    t.advance(2 * IDLE_MS);
    expect(port.start).not.toHaveBeenCalled();
    expect(port.suspend).not.toHaveBeenCalled();
    expect(t.pending()).toBe(0);
  });
});
