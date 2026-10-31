// Drum Coach's hardware-keyboard module: key down / up from an iPad hardware keyboard, timed on the same mach host
// clock as modules/drum-midi, for the app-wide keyboard fallback (CLAUDE.md keys). iOS only; every function degrades
// gracefully elsewhere (false, null, performance.now(), a no-op unsubscribe).
// apps/mobile/src/platform/keyboard.ts maps keys to pads (keyboardCore.ts) and feeds the app's hit bus.

import { native } from './src/DrumKeysModule';
import type { DebugInfo, KeyEvent } from './src/DrumKeys.types';

export * from './src/DrumKeys.types';

/** True when the native module is linked (an iOS development or release build). */
export const available = native != null;

const noop = () => {};

/** The one monotonic ms clock (mach host time). Off iOS: performance.now(), which is NOT the same base. */
export const nowMs = (): number => (native ? native.nowMs() : performance.now());

/** On: hardware keys come here whenever no text field is being edited (typing in a field stays the field's). */
export const setEnabled = (enabled: boolean): void => native?.setEnabled(enabled);

/** Takes the keys back now (after a modal closes or the route changes). No-op while a text field is edited. */
export const refocus = (): void => native?.refocus();

export const getDebugInfo = (): DebugInfo | null => native?.getDebugInfo() ?? null;

/** Every key down and up. Returns an unsubscribe function. */
export function onKey(fn: (e: KeyEvent) => void): () => void {
  if (!native) return noop;
  const sub = native.addListener('onKey', fn);
  return () => sub.remove();
}
