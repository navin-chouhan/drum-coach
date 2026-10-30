// "Hit each pad once" (web: src/ui/Calibrate.tsx PadWizard + core engine/calibration.ts): records the note each pad
// sends, in the core's order, with its debounce, duplicate-note check, skip and back. This file is the view model:
// what the big, throne-readable wizard shows (Setup → Pads and first-run step 3). Pure; the screen feeds it hits.
import { CALIBRATION_ORDER, back, calibrate, initialCal, skip, type CalState } from '@drum-coach/core/engine/calibration';
import { PAD_INFO, padForNote, type NoteMap, type PadId } from '@drum-coach/core/engine/kit';
import { dayKey } from '@drum-coach/core/engine/lesson';
import type { Settings } from '@drum-coach/core/input/settings';
import { MODULE_HELP } from './kitStore';

export { CALIBRATION_ORDER, initialCal, type CalState };

/** A part of the kit drawing (src/play/kitLayout.ts KitPartId): a drum, or the hi-hat pedal. */
export type KitSpot = 'kick' | 'snare' | 'hihat' | 'tom1' | 'tom2' | 'floor' | 'crash' | 'ride' | 'hhPedal';
export const SPOT: Record<PadId, KitSpot> = {
  kick: 'kick', snare: 'snare', hhOpen: 'hihat', hhClosed: 'hihat', hhPedal: 'hhPedal', tom1: 'tom1', tom2: 'tom2', floor: 'floor', crash: 'crash', ride: 'ride',
};
/** Where the pad is, from the throne (web WHERE), for pads without a core hint. */
export const WHERE: Partial<Record<PadId, string>> = {
  kick: 'Your right foot.', snare: 'The drum between your knees.', hhOpen: 'The hi-hat, with the pedal up.', hhPedal: 'Press the hi-hat pedal down once.',
  tom1: 'The small tom on the left, above the snare.', tom2: 'The tom on the right, above the kick.', floor: 'The big tom on your right.', crash: 'The cymbal on the left.', ride: 'The big cymbal on the right.',
};

export type WizardAction = { kind: 'hit'; note: number; time: number } | { kind: 'skip' } | { kind: 'back' } | { kind: 'restart' };

/**
 * One step of the wizard. A hit goes through the core's calibrate (debounce, pedal-before-closed, clash check). After
 * a hit is captured, `heard` names the pad whose saved note it was when that's another pad, so a wrong pad "just says
 * which one it was" (mockup) while the web's rule stays: the note is captured, and Back undoes it.
 */
export type WizardState = { cal: CalState; heard?: { pad: PadId; note: number; asPad: PadId } };

export const startWizard = (): WizardState => ({ cal: initialCal() });

export function wizardReduce(s: WizardState, a: WizardAction, map: NoteMap): WizardState {
  switch (a.kind) {
    case 'restart': return startWizard();
    case 'skip': return { cal: skip(s.cal) };
    case 'back': return { cal: back(s.cal) };
    case 'hit': {
      const pad = CALIBRATION_ORDER[s.cal.step];
      const cal = calibrate(s.cal, a.note, a.time);
      if (cal === s.cal) return s; // debounced or done: nothing changes
      if (!pad || cal.step === s.cal.step) return { cal }; // a clash: the warning shows instead
      const owner = padForNote(map, a.note);
      const sameDrum = owner && SPOT[owner] === SPOT[pad];
      return { cal, ...(owner && owner !== pad && !sameDrum && map[pad] !== a.note && { heard: { pad, note: a.note, asPad: owner } }) };
    }
  }
}

export type WizardRow = { pad: PadId; name: string; value: string; state: 'ok' | 'now' | 'kept' | 'todo' };
export type SpotState = 'now' | 'ok' | 'waiting';

export type WizardView = {
  done: boolean;
  /** "PAD 6 OF 10 · e-Drum" / "ALL PADS · e-Drum". */
  kicker: string;
  /** The pad to hit, as the big word ("TOM 1"), or null when done. */
  padWord: string | null;
  title: string;
  hint: string;
  rows: WizardRow[];
  spots: Record<KitSpot, SpotState>;
  current: PadId | null;
  /** The duplicate-note check (web wording, with the module fix). */
  conflict: string | null;
  /** "That sent tom 2's note (45). …" after a capture that matched another pad's saved note. */
  toast: string | null;
  canBack: boolean;
  /** "keeps 48": what Skip leaves for the current pad. */
  skipKeeps: string | null;
};

export function wizardView(s: WizardState, map: NoteMap, device: string): WizardView {
  const { cal } = s;
  const pad = CALIBRATION_ORDER[cal.step] ?? null;
  const n = CALIBRATION_ORDER.length;
  const rows: WizardRow[] = CALIBRATION_ORDER.map((p, i) => {
    const got = cal.captured[p];
    if (got !== undefined) return { pad: p, name: PAD_INFO[p].name, value: String(got), state: 'ok' };
    if (i === cal.step) return { pad: p, name: PAD_INFO[p].name, value: '…', state: 'now' };
    if (i < cal.step) return { pad: p, name: PAD_INFO[p].name, value: `kept ${map[p]}`, state: 'kept' };
    return { pad: p, name: PAD_INFO[p].name, value: '', state: 'todo' };
  });
  // The hi-hat is done only once both its open and closed notes are in (web KitMap).
  const spotDone = (spot: KitSpot) => CALIBRATION_ORDER.some(p => SPOT[p] === spot && cal.captured[p] !== undefined)
    && !(spot === 'hihat' && (cal.captured.hhOpen === undefined || cal.captured.hhClosed === undefined));
  const now = pad ? SPOT[pad] : null;
  const spots = Object.fromEntries((['kick', 'snare', 'hihat', 'tom1', 'tom2', 'floor', 'crash', 'ride', 'hhPedal'] as KitSpot[])
    .map(k => [k, k === now ? 'now' : spotDone(k) ? 'ok' : 'waiting'])) as Record<KitSpot, SpotState>;
  const conflict = cal.conflict
    ? `Note ${cal.conflict.note} is already used by ${PAD_INFO[cal.conflict.pad].name}, so the app can't tell these pads apart. Give this pad its own note. ${MODULE_HELP} Then hit it again.`
    : null;
  const h = s.heard;
  const toast = h && !cal.conflict
    ? `That sent ${PAD_INFO[h.asPad].name.toLowerCase()}'s note (${h.note}). If you hit ${PAD_INFO[h.asPad].name.toLowerCase()} by mistake, go back.`
    : null;
  return {
    done: !pad,
    kicker: `${pad ? `Pad ${cal.step + 1} of ${n}` : 'All pads'} · ${device}`,
    padWord: pad ? PAD_INFO[pad].name.toUpperCase() : null,
    title: pad ? `Hit ${PAD_INFO[pad].name.toUpperCase()}` : 'All done!',
    hint: pad ? PAD_INFO[pad].hint ?? WHERE[pad] ?? '' : 'Save, and every hit counts on the right pad.',
    rows, spots, current: pad, conflict, toast,
    canBack: cal.step > 0,
    skipKeeps: pad ? `keeps ${map[pad]}` : null,
  };
}

/** What Save writes (web PadWizard save): the captured notes over the current map, and today's date in settings. */
export function wizardSave(s: WizardState, map: NoteMap, now = new Date()): { map: NoteMap; settings: Pick<Settings, 'padsCheckedAt'> } {
  return { map: { ...map, ...s.cal.captured }, settings: { padsCheckedAt: dayKey(now) } };
}

/** Hardware-keyboard keys while the big wizard runs (web: ← back, Esc stop). */
export function wizardKey(key: string): 'back' | 'stop' | null {
  return key === 'ArrowLeft' ? 'back' : key === 'Escape' ? 'stop' : null;
}
