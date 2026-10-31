// "Play drum sounds on the iPad" (the web's browserSounds, src/ui/App.tsx): every hit on the app's hit bus (the kit,
// a hardware keyboard) plays drum.<pad> right away through the audio port's playNow, on the hit's own path (the bus
// calls its listeners synchronously as the MIDI batch is read: nothing is scheduled). Off by default, as the web.
// The touch pads already sound their own strokes: they emit inside withoutKitSound, so a stroke never sounds twice.
// Pure (no React Native): src/ui/useKitSounds.ts mounts it at the app root.
import type { Hit } from '@drum-coach/core/input/hits';
import type { SoundId } from '@drum-coach/core/play/audioPort';
import { padSound, velocityGain } from './touch';

let quiet = 0;

/** Runs `emit` (a touch pad's emitPad, which has sounded already) without the kit sound for the hits it makes. */
export function withoutKitSound<T>(emit: () => T): T {
  quiet++;
  try { return emit(); } finally { quiet--; }
}

export type KitSoundDeps = {
  onHit: (fn: (h: Hit) => void) => () => void;
  /** Whether the setting is on (read from memory: no storage read per hit). */
  enabled: () => boolean;
  playNow: (sound: SoundId, gain: number) => void;
};

/** Listens to the hit bus and sounds each hit while `enabled()`. Returns stop. */
export function startKitSounds(deps: KitSoundDeps): () => void {
  return deps.onHit(h => {
    if (quiet || !h.pad || !deps.enabled()) return;
    deps.playNow(padSound(h.pad), velocityGain(h.velocity));
  });
}
