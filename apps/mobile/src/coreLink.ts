// Proof that the app reaches @drum-coach/core (packages/core) through Metro: the home screen shows the core's
// snare note. The optional require keeps this building before A1 moves the engine into packages/core
// (expo/metro-config sets allowOptionalDependencies, so a require inside try/catch that doesn't resolve becomes a
// runtime throw, not a bundling error). Once packages/core/src/engine/kit.ts exists, it resolves and shows 38.
// After A1's merge this can become a plain `import { DEFAULT_NOTE_MAP } from '@drum-coach/core/engine/kit'`.
type KitModule = { DEFAULT_NOTE_MAP?: { snare?: unknown } };

export type CoreLink = { ok: true; snareNote: number } | { ok: false; reason: string };

export function coreLink(): CoreLink {
  try {
    const kit = require('@drum-coach/core/engine/kit') as KitModule;
    const snare = kit.DEFAULT_NOTE_MAP?.snare;
    return typeof snare === 'number' ? { ok: true, snareNote: snare } : { ok: false, reason: 'DEFAULT_NOTE_MAP.snare missing' };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.split('\n')[0] : String(e) };
  }
}
