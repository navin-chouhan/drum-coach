// Proof that the app reaches @drum-coach/core (packages/core) through Metro: the about screen shows the core's
// snare note (38).
import { DEFAULT_NOTE_MAP } from '@drum-coach/core/engine/kit';

export type CoreLink = { ok: true; snareNote: number } | { ok: false; reason: string };

export function coreLink(): CoreLink {
  const snare: unknown = DEFAULT_NOTE_MAP.snare;
  return typeof snare === 'number' ? { ok: true, snareNote: snare } : { ok: false, reason: 'DEFAULT_NOTE_MAP.snare missing' };
}
