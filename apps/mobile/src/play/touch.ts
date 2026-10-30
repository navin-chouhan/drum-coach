// Touch pads: from a finger to a pad stroke. Pure TypeScript (Vitest-tested); TouchPads.tsx feeds it touch events.
import type { PadId } from './chartLike';
import type { KitPart } from './kitLayout';

/**
 * Where velocity comes from (owner question open in docs/mockups/ipad/NOTES.md, touch pads Q1):
 * - 'auto': the touch's force when the device reports one (Apple Pencil; React Native gives 0..1), else fixed;
 * - 'centre': nearer the centre = louder (as drawn in the mockup);
 * - 'fixed': always `fixed`.
 */
export type VelocityMode = 'auto' | 'centre' | 'fixed';

/** The keyboard fallback's normal stroke (src/input/keyboard.ts). */
export const TOUCH_VELOCITY = 96;
export const MIN_TOUCH_VELOCITY = 40;

export function touchVelocity(mode: VelocityMode, o: { force?: number; edge: number; fixed?: number }): number {
  const fixed = Math.round(Math.min(127, Math.max(1, o.fixed ?? TOUCH_VELOCITY)));
  if (mode === 'auto' && o.force !== undefined && Number.isFinite(o.force) && o.force > 0) {
    return Math.round(MIN_TOUCH_VELOCITY + (127 - MIN_TOUCH_VELOCITY) * Math.min(1, o.force));
  }
  if (mode === 'centre') {
    const e = Math.min(1, Math.max(0, Number.isFinite(o.edge) ? o.edge : 1));
    return Math.round(127 - (127 - MIN_TOUCH_VELOCITY) * e);
  }
  return fixed;
}

/**
 * Which pad the hi-hat sends (owner question open, touch pads Q2):
 * - 'closed': always closed; the pedal strip only sends the foot (44);
 * - 'kit': like the real MPS-150, open (46) unless the pedal strip is held, then closed (42).
 */
export type HiHatMode = 'closed' | 'kit';

export function hihatPad(mode: HiHatMode, pedalHeld: boolean): PadId {
  if (mode === 'kit') return pedalHeld ? 'hhClosed' : 'hhOpen';
  return 'hhClosed';
}

/** The pad a touched part sends. */
export function padForPart(part: KitPart, hihat: HiHatMode, pedalHeld: boolean): PadId {
  if (part.id === 'hhPedal') return 'hhPedal';
  if (part.drum === 'hihat') return hihatPad(hihat, pedalHeld);
  return part.drum as Exclude<PadId, 'hhClosed' | 'hhOpen' | 'hhPedal'>;
}

/**
 * The stroke's Clock time. iOS gives each touch its UITouch timestamp in ms (seconds since boot × 1000, the same base
 * as mach host time), which is earlier and steadier than when JS gets the event. It's used when it is plausibly on
 * the Clock (at most `maxAgeMs` old and not in the future); otherwise the JS arrival time is used.
 */
export function strokeTime(eventTimestamp: number | undefined, clockNow: number, maxAgeMs = 250): number {
  if (eventTimestamp === undefined || !Number.isFinite(eventTimestamp)) return clockNow;
  const age = clockNow - eventTimestamp;
  return age >= 0 && age <= maxAgeMs ? eventTimestamp : clockNow;
}

/** The sound the AudioPort plays for a pad (AudioPort SoundId `drum.${PadId}`) and its gain. */
export const padSound = (pad: PadId): `drum.${PadId}` => `drum.${pad}`;
export const velocityGain = (velocity: number): number => Math.min(1, Math.max(0, velocity / 127));
