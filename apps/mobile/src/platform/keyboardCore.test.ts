import { describe, expect, it, vi } from 'vitest';
import { appKeyFor, COMMAND_CHARS, connectKeysToHitBus, KEYMAP, strokesFor, type KeyEventLike } from './keyboardCore';

const ev = (key: string, over: Partial<KeyEventLike> = {}): KeyEventLike => ({ key, down: true, shift: false, alt: false, timeMs: 1000, ...over });

describe('keyboard fallback', () => {
  it('uses the web key map (src/input/keyboard.ts KEYMAP)', () => {
    expect(KEYMAP).toEqual({
      ' ': 'kick', x: 'kick', s: 'snare', a: 'hhClosed', q: 'hhOpen', z: 'hhPedal', e: 'tom1', r: 'tom2', f: 'floor', w: 'crash', t: 'ride',
    });
  });

  it('plays a pad at 96, Shift accents at 127, Option flams 25 ms later', () => {
    expect(strokesFor(ev('s'))).toEqual([{ pad: 'snare', velocity: 96, time: 1000 }]);
    expect(strokesFor(ev(' ', { shift: true }))).toEqual([{ pad: 'kick', velocity: 127, time: 1000 }]);
    expect(strokesFor(ev('S'))).toEqual([{ pad: 'snare', velocity: 96, time: 1000 }]);
    expect(strokesFor(ev('q', { alt: true, shift: true }))).toEqual([
      { pad: 'hhOpen', velocity: 40, time: 1000 }, { pad: 'hhOpen', velocity: 127, time: 1025 },
    ]);
    expect(strokesFor(ev('s', { down: false }))).toEqual([]);
    expect(strokesFor(ev('k'))).toEqual([]);
  });

  it('names Esc and Enter on key down only', () => {
    expect(appKeyFor(ev('Escape'))).toBe('escape');
    expect(appKeyFor(ev('Enter'))).toBe('enter');
    expect(appKeyFor(ev('Enter', { down: false }))).toBeNull();
    expect(appKeyFor(ev('s'))).toBeNull();
  });

  it('names the web command keys: arrows, H / B, digits; never a pad key, and letters only without Shift / Option', () => {
    expect(appKeyFor(ev('ArrowLeft'))).toBe('left');
    expect(appKeyFor(ev('ArrowRight'))).toBe('right');
    expect(appKeyFor(ev('ArrowUp'))).toBe('up');
    expect(appKeyFor(ev('ArrowDown'))).toBe('down');
    expect(appKeyFor(ev('ArrowLeft', { shift: true }))).toBe('left');
    expect(appKeyFor(ev('Escape', { alt: true }))).toBe('escape');
    expect(appKeyFor(ev('h'))).toBe('h');
    expect(appKeyFor(ev('b'))).toBe('b');
    expect(appKeyFor(ev('1'))).toBe('1');
    expect(appKeyFor(ev('h', { shift: true }))).toBeNull(); // web: "H" isn't 'h'
    expect(appKeyFor(ev('h', { alt: true }))).toBeNull();
    expect(appKeyFor(ev('h', { down: false }))).toBeNull();
    expect(appKeyFor(ev('constructor'))).toBeNull();
    expect(appKeyFor(ev('F1'))).toBeNull();
    for (const k of Object.keys(KEYMAP)) expect(appKeyFor(ev(k))).toBeNull(); // Space and the pad letters stay pads
  });

  it('keeps pads and commands apart: every letter and digit is exactly one of them', () => {
    const chars = [...'abcdefghijklmnopqrstuvwxyz0123456789'];
    for (const c of chars) {
      const pad = strokesFor(ev(c)).length > 0, cmd = appKeyFor(ev(c)) !== null;
      expect(pad !== cmd, c).toBe(true);
    }
    expect(COMMAND_CHARS.filter(c => c in KEYMAP)).toEqual([]);
  });

  it('a command key never plays a stroke on the hit bus, and reaches the listeners', () => {
    let send: (e: KeyEventLike) => void = () => {};
    const api = { available: true, onKey: (fn: (e: KeyEventLike) => void) => { send = fn; return () => {}; }, setEnabled: () => {} };
    const emitPad = vi.fn(), got: string[] = [];
    const link = connectKeysToHitBus(api, { emitPad });
    link.onAppKey(k => { got.push(k); });
    for (const k of ['h', 'b', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', '2']) { send(ev(k)); send(ev(k, { down: false })); }
    send(ev('ArrowLeft')); send(ev('ArrowLeft')); // held: once
    expect(emitPad).not.toHaveBeenCalled();
    expect(got).toEqual(['h', 'b', 'left', 'right', 'enter', 'escape', '2', 'left']);
    link.stop();
  });

  it('feeds the hit bus once per press, drops held repeats, and routes Esc to the newest listener', () => {
    let send: (e: KeyEventLike) => void = () => {};
    const setEnabled = vi.fn();
    const api = { available: true, onKey: (fn: (e: KeyEventLike) => void) => { send = fn; return () => { send = () => {}; }; }, setEnabled };
    const emitPad = vi.fn();
    const link = connectKeysToHitBus(api, { emitPad });
    expect(setEnabled).toHaveBeenLastCalledWith(true);

    send(ev('e', { timeMs: 5 }));
    send(ev('e', { timeMs: 6 })); // held: no second stroke
    send(ev('e', { down: false }));
    send(ev('e', { timeMs: 300 }));
    expect(emitPad.mock.calls).toEqual([['tom1', 96, 5], ['tom1', 96, 300]]);
    expect(link.counters).toEqual({ keys: 2, strokes: 2, repeatsDropped: 1 });

    const older = vi.fn(), newer = vi.fn(() => true);
    link.onAppKey(older);
    const offNewer = link.onAppKey(newer);
    send(ev('Escape'));
    expect(newer).toHaveBeenCalledWith('escape');
    expect(older).not.toHaveBeenCalled();
    send(ev('Escape', { down: false }));
    offNewer();
    send(ev('Escape'));
    expect(older).toHaveBeenCalledWith('escape');

    link.stop();
    expect(setEnabled).toHaveBeenLastCalledWith(false);
    send(ev('s', { timeMs: 900 }));
    expect(emitPad).toHaveBeenCalledTimes(2);
  });
});
