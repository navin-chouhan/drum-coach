import { describe, expect, it, vi } from 'vitest';
import { readSettings, SETTINGS_KEY, writeSettings } from './appSettings';
import { createKitMoveRouter } from './kitMoves';
import { statusRows } from './status';

describe('createKitMoveRouter', () => {
  it('runs the move for a finished gesture, once', () => {
    const yes = vi.fn(), next = vi.fn(), listen = vi.fn();
    const r = createKitMoveRouter({ yes, next, listen });
    expect(r.hit({ pad: 'ride', time: 0 })).toBeUndefined();
    expect(r.hit({ pad: 'ride', time: 200 })).toBe('next');
    expect(next).toHaveBeenCalledTimes(1);
    r.hit({ pad: 'hhPedal', time: 1000 }); r.hit({ pad: 'hhPedal', time: 1200 });
    expect(r.hit({ pad: 'hhPedal', time: 1400 })).toBe('yes');
    r.hit({ pad: 'tom2', time: 3000 });
    expect(r.hit({ pad: 'tom2', time: 3700 })).toBeUndefined(); // too slow: not a double
    expect(listen).not.toHaveBeenCalled();
  });
  it('ignores gestures with no move on this screen, and swaps handlers', () => {
    const r = createKitMoveRouter({});
    r.hit({ pad: 'floor', time: 0 });
    expect(r.hit({ pad: 'floor', time: 100 })).toBeUndefined();
    const slower = vi.fn();
    r.set({ slower });
    r.hit({ pad: 'floor', time: 1000 }); r.hit({ pad: 'floor', time: 1100 });
    expect(slower).toHaveBeenCalledTimes(1);
  });
  it('during a take only crash × 4 stops', () => {
    const stop = vi.fn(), yes = vi.fn();
    const r = createKitMoveRouter({ stop, yes });
    for (let i = 0; i < 4; i++) r.hit({ pad: 'crash', time: i * 100 }, true);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(yes).not.toHaveBeenCalled();
  });
});

describe('settings in the key-value store', () => {
  const store = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); }, remove: (k: string) => { m.delete(k); } }; };
  it('reads defaults when empty or broken', () => {
    const kv = store();
    expect(readSettings(kv).profile.minutesPerDay).toBe(25);
    kv.set(SETTINGS_KEY, '{nope');
    expect(readSettings(kv).lessons).toEqual({});
  });
  it('writes a patch over what is saved, keeping the rest', () => {
    const kv = store();
    writeSettings(kv, { latencyMs: 31 }, 5);
    const s = writeSettings(kv, { profile: { goals: ['rock'], minutesPerDay: 20, onboarded: true } }, 6);
    expect(s.latencyMs).toBe(31);
    expect(readSettings(kv).profile.goals).toEqual(['rock']);
    expect(readSettings(kv).updatedAt).toBe(6);
  });
});

describe('statusRows', () => {
  it('says what the mockup says when all is well', () => {
    const rows = statusRows({ midi: true, kit: 'e-Drum', latencyMs: 31, coach: 'reachable' });
    expect(rows.map(r => [r.name, r.value])).toEqual([['e-Drum', 'connected'], ['Latency', '31 ms'], ['Coach', 'home server']]);
    expect(rows[0].dot).toBe('on');
  });
  it('day one: no kit, nothing measured, no server', () => {
    const rows = statusRows({ midi: true, kit: null, latencyMs: null, coach: 'not-configured' });
    expect(rows.map(r => r.value)).toEqual(['not plugged in', 'not measured', 'not set up']);
    expect(statusRows({ midi: false, kit: null, latencyMs: null, coach: 'unreachable' })[0].value).toBe('touch pads');
  });
});
