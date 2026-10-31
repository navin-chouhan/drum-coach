// The keyboard fallback (CLAUDE.md: Space kick, S snare, A/Q hi-hat closed/open, Z pedal, E/R/F toms, W crash,
// T ride), the same rules as the web's src/input/keyboard.ts: Shift = accent (127), Option/Alt = flam (a soft grace,
// then the main stroke 25 ms later), ⌘/⌃ combinations are never seen (native passes them through). Command
// keys (Esc, Enter, arrows, letters and digits that aren't pad keys: H hints, B band, 1–3 answers) go to the screens.
// Pure (no React Native): keyboard.ts wires the DrumKeys module (modules/drum-keys).
import type { PadId } from '@drum-coach/core/engine/kit';
import type { HitBus } from '@drum-coach/core/input/hits';

/** The DrumKeys key event (modules/drum-keys/src/DrumKeys.types.ts), the fields used here. */
export type KeyEventLike = { key: string; down: boolean; shift: boolean; alt: boolean; timeMs: number };

/** src/input/keyboard.ts KEYMAP (X is a second kick key, as on the web). */
export const KEYMAP: Readonly<Record<string, PadId>> = {
  ' ': 'kick', x: 'kick', s: 'snare', a: 'hhClosed', q: 'hhOpen', z: 'hhPedal',
  e: 'tom1', r: 'tom2', f: 'floor', w: 'crash', t: 'ride',
};

export const VELOCITY = { normal: 96, accent: 127, grace: 40 } as const;
export const FLAM_MS = 25;

export type Stroke = { pad: PadId; velocity: number; time: number };

/** The strokes a key down plays (none for other keys and key ups). */
export function strokesFor(e: KeyEventLike): Stroke[] {
  if (!e.down) return [];
  const pad = KEYMAP[e.key.toLowerCase()];
  if (!pad) return [];
  const velocity = e.shift ? VELOCITY.accent : VELOCITY.normal;
  if (e.alt) return [{ pad, velocity: VELOCITY.grace, time: e.timeMs }, { pad, velocity, time: e.timeMs + FLAM_MS }];
  return [{ pad, velocity, time: e.timeMs }];
}

/** Named command keys as the web's KeyboardEvent.key spells them (DrumKeys sends these names) → the app's names. */
const NAMED: ReadonlyMap<string, NamedKey> = new Map([
  ['Escape', 'escape'], ['Enter', 'enter'], ['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['ArrowUp', 'up'], ['ArrowDown', 'down'],
]);
export type NamedKey = 'escape' | 'enter' | 'left' | 'right' | 'up' | 'down';

/** Letters and digits that are commands: every one that isn't a pad key, so a command key never becomes a hit. */
export const COMMAND_CHARS = [
  'b', 'c', 'd', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'u', 'v', 'y',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
] as const;
export type CommandChar = (typeof COMMAND_CHARS)[number];

/** A key the screens may use: Esc, Enter, an arrow, or a non-pad letter / digit (web: `e.key === 'h'`, `'1'`). */
export type AppKey = NamedKey | CommandChar;

const CHARS: ReadonlySet<string> = new Set(COMMAND_CHARS);

/**
 * The command a key down is; null for pad keys, key ups and anything else. Letters and digits count only without
 * Shift or Option, as the web compares `e.key` (Shift+H is "H" there); Esc, Enter and the arrows with any modifier.
 */
export function appKeyFor(e: KeyEventLike): AppKey | null {
  if (!e.down) return null;
  const named = NAMED.get(e.key);
  if (named) return named;
  return CHARS.has(e.key) && !e.shift && !e.alt ? (e.key as CommandChar) : null;
}

export type KeysApi = {
  available: boolean;
  onKey: (fn: (e: KeyEventLike) => void) => () => void;
  setEnabled: (on: boolean) => void;
};

export type KeyboardLink = {
  /** Command-key listeners (the newest first gets it; return true to stop it there). Returns an unsubscribe. */
  onAppKey: (fn: (key: AppKey) => boolean | void) => () => void;
  stop: () => void;
  readonly counters: { keys: number; strokes: number; repeatsDropped: number };
};

/**
 * Feeds the hit bus from the keyboard: each key down plays its strokes once (a held key that sends down again is
 * dropped, as the web skips `e.repeat`). Esc and Enter go to `onAppKey` listeners.
 */
export function connectKeysToHitBus(api: KeysApi, bus: Pick<HitBus, 'emitPad'>): KeyboardLink {
  const held = new Set<string>();
  const appKeys: ((key: AppKey) => boolean | void)[] = [];
  const counters = { keys: 0, strokes: 0, repeatsDropped: 0 };
  const off = api.onKey(e => {
    const id = e.key.toLowerCase();
    if (!e.down) { held.delete(id); return; }
    if (held.has(id)) { counters.repeatsDropped++; return; }
    held.add(id);
    counters.keys++;
    for (const s of strokesFor(e)) { counters.strokes++; bus.emitPad(s.pad, s.velocity, s.time); }
    const app = appKeyFor(e);
    if (app) for (const fn of [...appKeys].reverse()) if (fn(app) === true) break;
  });
  api.setEnabled(true);
  return {
    onAppKey(fn) {
      appKeys.push(fn);
      return () => { const i = appKeys.indexOf(fn); if (i >= 0) appKeys.splice(i, 1); };
    },
    stop() { off(); api.setEnabled(false); held.clear(); appKeys.length = 0; },
    counters,
  };
}
