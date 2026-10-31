// "Soft, then loud" (web: src/ui/PadCalibration.tsx VelocityWizard; N9 fair hardware): per pad, four soft taps then
// four loud strokes, measured with the core's measurePad so dynamics and retriggers are judged the same on every pad.
// Pure state machine: the screen feeds it raw MIDI note-ons from the kit (retriggers included), or the hit bus's hits
// with no kit, and calls tick() so a pad finishes a moment after its last loud stroke (to catch its retrigger).
import { PAD_INFO, type NoteMap, type PadId } from '@drum-coach/core/engine/kit';
import { measurePad, type KitCalibration, type PadCalibration } from '@drum-coach/core/engine/padCal';

export const VELOCITY_PADS: PadId[] = ['kick', 'snare', 'hhClosed', 'tom1', 'tom2', 'floor', 'crash', 'ride'];
/** Four strokes each; a stroke closer than GAP_MS to the one before is that one's retrigger. */
export const STROKES = 4, GAP_MS = 150;
/** The web waits this long after the fourth loud stroke before the pad is measured: its last retrigger. */
export const SETTLE_MS = 300;

type Stroke = { time: number; velocity: number };
export type VelocityState = {
  on: boolean;
  i: number;
  phase: 'soft' | 'loud';
  softs: number[];
  louds: Stroke[];
  /** This run's measurements (saved on finish or Stop). */
  done: KitCalibration;
  /** When the current pad gets measured (after its fourth loud stroke), or null. */
  finishAt: number | null;
};

export const idleVelocity = (): VelocityState => ({ on: false, i: 0, phase: 'soft', softs: [], louds: [], done: {}, finishAt: null });
export const startVelocity = (): VelocityState => ({ ...idleVelocity(), on: true });

/** Main strokes among the loud ones (retriggers within GAP_MS don't count). */
export const mainStrokes = (xs: Stroke[]) => xs.filter((h, k) => !k || h.time - xs[k - 1].time >= GAP_MS).length;

/** The result of a step: the new state, plus the calibration to save when the run ended (finished or stopped). */
export type VelocityStep = { state: VelocityState; save?: KitCalibration };

/** One note-on. Only the current pad's note counts; velocity 0 (note off) never does. */
export function velocityNote(s: VelocityState, map: NoteMap, note: number, velocity: number, time: number): VelocityStep {
  const pad = VELOCITY_PADS[s.i];
  if (!s.on || !pad || note !== map[pad] || !velocity) return { state: s };
  if (s.phase === 'soft') {
    const softs = [...s.softs, velocity];
    return { state: { ...s, softs, phase: softs.length >= STROKES ? 'loud' : 'soft' } };
  }
  const louds = [...s.louds, { time, velocity }];
  const finishAt = s.finishAt ?? (mainStrokes(louds) >= STROKES ? time + SETTLE_MS : null);
  return { state: { ...s, louds, finishAt } };
}

/** Measures the current pad once its settle time has passed. */
export function velocityTick(s: VelocityState, now: number, existing: KitCalibration): VelocityStep {
  if (!s.on || s.finishAt === null || now < s.finishAt) return { state: s };
  const pad = VELOCITY_PADS[s.i];
  return nextPad({ ...s, done: { ...s.done, [pad]: measurePad(s.softs, s.louds) } }, existing);
}

/** Skip this pad (web "Skip this pad"); after the last pad the run ends and saves. */
export function nextPad(s: VelocityState, existing: KitCalibration): VelocityStep {
  const fresh = { softs: [], louds: [], phase: 'soft' as const, finishAt: null };
  if (s.i + 1 >= VELOCITY_PADS.length) return { state: idleVelocity(), save: { ...existing, ...s.done } };
  return { state: { ...s, ...fresh, i: s.i + 1 } };
}

/** "◀ Redo this pad". */
export const redoPad = (s: VelocityState): VelocityState => ({ ...s, softs: [], louds: [], phase: 'soft', finishAt: null });

/** "Stop (keeps what's done)". */
export function stopVelocity(s: VelocityState, existing: KitCalibration): VelocityStep {
  return { state: idleVelocity(), ...(Object.keys(s.done).length && { save: { ...existing, ...s.done } }) };
}

const dots = (n: number) => '●'.repeat(Math.min(n, STROKES)) + '○'.repeat(Math.max(0, STROKES - n));

export type VelocityView = {
  on: boolean;
  /** "Pad 2 of 8". */
  step: string;
  /** "Snare: four soft taps (3 cm)". */
  prompt: string;
  phase: 'soft' | 'loud';
  softDots: string;
  loudDots: string;
  rows: { pad: PadId; name: string; value: string; current: boolean }[];
};

export function velocityView(s: VelocityState): VelocityView {
  const pad = VELOCITY_PADS[s.i];
  return {
    on: s.on,
    step: `Pad ${s.i + 1} of ${VELOCITY_PADS.length}`,
    prompt: `${PAD_INFO[pad].name}: four ${s.phase} ${s.phase === 'soft' ? 'taps (3 cm)' : 'strokes (full height)'}`,
    phase: s.phase,
    softDots: dots(s.softs.length),
    loudDots: dots(mainStrokes(s.louds)),
    rows: VELOCITY_PADS.map((p, k) => {
      const d = s.done[p];
      return { pad: p, name: PAD_INFO[p].name, current: k === s.i, value: d ? `soft ${Math.round(d.soft)} · loud ${Math.round(d.loud)}` : k < s.i ? 'skipped' : '…' };
    }),
  };
}

/** The saved calibration, one line per pad (web calSummary). */
export function calSummary(cal: KitCalibration): { pad: PadId; name: string; text: string }[] {
  return (Object.entries(cal) as [PadId, PadCalibration][]).map(([p, c]) => ({
    pad: p, name: PAD_INFO[p].name,
    text: `soft ${Math.round(c.soft)}, loud ${Math.round(c.loud)}${c.bounceMs ? ` · retriggers within ${c.bounceMs} ms at under ${Math.round((c.bounceRatio ?? 0) * 100)}%: filtered` : ' · no retriggers seen'}`,
  }));
}

/** The intro and the no-kit note (web wording). */
export const VELOCITY_INTRO = 'Every pad reads stroke heights a little differently. Four soft taps and four loud strokes per pad let the app judge '
  + 'accents, ghost notes and soft/loud parts the same on every pad, and filter each pad\'s own double-triggers. About 2 minutes.';
export const VELOCITY_NO_KIT = 'No kit plugged in: the touch pads or a keyboard work for trying it, but calibrate with the kit.';
