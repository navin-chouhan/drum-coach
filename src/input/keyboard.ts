import type { PadId } from '../engine/kit';
import { emitPad } from './hits';

export const KEYMAP: Record<string, PadId> = {
  ' ': 'kick', x: 'kick', s: 'snare', a: 'hhClosed', q: 'hhOpen', z: 'hhPedal',
  e: 'tom1', r: 'tom2', f: 'floor', w: 'crash', t: 'ride',
};

/** Keyboard fallback; Shift = accent (velocity 127), Alt = flam (a soft grace, then the main stroke 25 ms later). Returns a cleanup function. */
export function startKeyboard() {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey) return;
    if (e.target instanceof Element && e.target.matches('input, select, textarea')) return;
    // with Alt the key's character changes on some layouts: map it by its physical key
    const pad = KEYMAP[e.altKey ? (e.code === 'Space' ? ' ' : e.code.replace(/^Key/, '').toLowerCase()) : e.key.toLowerCase()];
    if (!pad) return;
    e.preventDefault();
    if (e.altKey) { emitPad(pad, 40, e.timeStamp); emitPad(pad, e.shiftKey ? 127 : 96, e.timeStamp + 25); return; }
    emitPad(pad, e.shiftKey ? 127 : 96, e.timeStamp);
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
