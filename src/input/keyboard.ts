import type { PadId } from '../engine/kit';
import { emitPad } from './hits';

export const KEYMAP: Record<string, PadId> = {
  ' ': 'kick', x: 'kick', s: 'snare', a: 'hhClosed', q: 'hhOpen', z: 'hhPedal',
  e: 'tom1', r: 'tom2', f: 'floor', w: 'crash', t: 'ride',
};

/** Keyboard fallback; Shift = accent (velocity 127). Returns a cleanup function. */
export function startKeyboard() {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.matches('input, select, textarea')) return;
    const pad = KEYMAP[e.key.toLowerCase()];
    if (!pad) return;
    e.preventDefault();
    emitPad(pad, e.shiftKey ? 127 : 96, e.timeStamp);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
