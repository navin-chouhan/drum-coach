// The app-wide hardware-keyboard fallback on the DrumKeys native module (modules/drum-keys). The logic is in
// keyboardCore.ts (tested in Vitest); this file only wires the real module. Mounted once in app/_layout.tsx.
import type { HitBus } from '@drum-coach/core/input/hits';
import * as DrumKeys from '../../modules/drum-keys';
import { connectKeysToHitBus, type AppKey, type KeyboardLink } from './keyboardCore';

export { KEYMAP, strokesFor, appKeyFor, type AppKey, type KeyboardLink, type Stroke } from './keyboardCore';

// One link per JS runtime, kept across Fast Refresh (a second link would play every key twice).
type G = { __drumKeyboard?: KeyboardLink };
const g = globalThis as G;

/** Starts the keyboard → hit bus link once (idempotent). Returns the link. */
export function startKeyboard(bus: Pick<HitBus, 'emitPad'>): KeyboardLink {
  return (g.__drumKeyboard ??= connectKeysToHitBus(DrumKeys, bus));
}

/** Esc / Enter from the hardware keyboard; the newest listener first, `true` stops it there. Returns an unsubscribe. */
export function onAppKey(fn: (key: AppKey) => boolean | void): () => void {
  return g.__drumKeyboard ? g.__drumKeyboard.onAppKey(fn) : () => {};
}

/** Takes the keys back after a modal closes or the route changes. */
export const refocusKeyboard = (): void => DrumKeys.refocus();

/** Whether a hardware keyboard can play pads here (the native module is linked). */
export const keyboardAvailable = DrumKeys.available;
