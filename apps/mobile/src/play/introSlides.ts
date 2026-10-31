// The intro slides' model (web src/play/IntroSlides.tsx): what each slide shows, and how the kit turns them. Pure
// (no React Native): IntroSlides.tsx draws it. Slides: what · who plays what · count it like this · how it moves.
import type { ChartNote } from '@drum-coach/core/engine/chart';
import type { PadId } from '@drum-coach/core/engine/kit';
import { limbPlan, noteHints } from '@drum-coach/core/engine/notation';

/** A stick bounce or a double hit counts once. */
export const TAP_GAP_MS = 250;

export type IntroInput = {
  title: string; sub?: string; bpm: number; what: string;
  notes: (ChartNote & { mine?: boolean })[]; beatsPerBar: number; focus?: string; leftHanded?: boolean;
};

/** The second and third slides: each limb's drums and when, the first bar's count with its limbs, the pedal note. */
export function introContent(x: IntroInput) {
  const left = !!x.leftHanded; // N9: a left-handed player's hints mirror
  const plan = limbPlan(x.notes, x.beatsPerBar, left);
  const firstBar = noteHints(x.notes.filter(n => n.t < x.beatsPerBar - 1e-6), x.beatsPerBar, left).slice(0, 16)
    .map(h => ({ ...h, beat: Number.isInteger(h.t) }));
  const pedalDown = x.notes.some(n => n.drum === 'hihat') && !plan.some(p => p.limb === 'H');
  return { kicker: `${x.title.toUpperCase()} · ${x.bpm} BPM`, big: x.sub ?? x.title, plan, firstBar, pedalDown };
}

/**
 * The kit's taps while the slides are up: one hi-hat hit forward, one snare hit back, other pads nothing; hits closer
 * than TAP_GAP_MS to the last counted one are ignored. Returns the move and the time to remember.
 */
export function introTap(lastAt: number, hit: { pad?: PadId; time: number }): { move: 'next' | 'back' | null; at: number } {
  if (hit.time - lastAt < TAP_GAP_MS) return { move: null, at: lastAt };
  if (hit.pad === 'hhClosed' || hit.pad === 'hhOpen') return { move: 'next', at: hit.time };
  if (hit.pad === 'snare') return { move: 'back', at: hit.time };
  return { move: null, at: lastAt };
}
