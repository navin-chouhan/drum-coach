// Setup → Sound and you (web: src/ui/SoundCheckCard.tsx, Calibrate's "Which hand leads"): the level sliders, the
// AudioPort bus levels from settings, and the sound check from the throne (click, band, voice; answer with a pad or
// keys 1–3). Pure; the screen plays the sounds through AudioPort.
import type { PadId } from '@drum-coach/core/engine/kit';
import type { Settings } from '@drum-coach/core/input/settings';

export type LevelKey = 'clickVolume' | 'bandVolume' | 'voiceVolume';
export const LEVEL_MIN: Record<LevelKey, number> = { clickVolume: 0.2, voiceVolume: 0.2, bandVolume: 0 };
export const LEVEL_MAX = 1.25, LEVEL_STEP = 0.05;
export const LEVEL_LABEL: Record<LevelKey, string> = { clickVolume: 'Click and music', bandVolume: 'Band (bass and keys under grooves)', voiceVolume: 'Coach voice' };

export const levelOf = (s: Settings, k: LevelKey) => s[k] ?? (k === 'bandVolume' ? 0.6 : 1);

/** A slider value snapped to the step and clamped to its range. */
export const clampLevel = (k: LevelKey, v: number) => Math.round(Math.max(LEVEL_MIN[k], Math.min(LEVEL_MAX, Math.round(v / LEVEL_STEP) * LEVEL_STEP)) * 100) / 100;

/** AudioPort.setLevels from settings (the web mixes drums with the click level; the band only when it's on). */
export function busLevels(s: Settings): Record<'click' | 'drums' | 'band' | 'voice', number> {
  return { click: s.clickVolume, drums: s.clickVolume, band: levelOf(s, 'bandVolume'), voice: s.voiceVolume };
}

/** One step louder or quieter (answer 0 = too quiet, 2 = too loud), within the slider's range (web nudgeLevel). */
export const nudgeLevel = (v: number, answer: number, key: LevelKey) =>
  Math.round(Math.max(key === 'bandVolume' ? 0 : 0.2, Math.min(1.25, v + (answer === 0 ? 0.1 : answer === 2 ? -0.1 : 0))) * 100) / 100;

export const SOUND_INTRO = 'For headphones on the module with the iPad in its AUX IN. Set the iPad volume to about 70% and use the module\'s '
  + 'volume knob for your drums. Then play a simple beat along with the click and set the click so you hear it clearly over your drums. '
  + 'Last, set the coach\'s voice so it\'s clear but not louder than the kit.';
export const VOICE_TEST = "This is my voice. If you can't hear me clearly over your drums, move the coach voice slider up.";

// ---- The sound check from the throne ----
export const THRONE_STEPS: { key: LevelKey; name: string; ask: string }[] = [
  { key: 'clickVolume', name: 'The click', ask: 'Play a simple beat along with the click. Can you hear it clearly over your drums?' },
  { key: 'bandVolume', name: 'The band', ask: 'Play a simple beat along with the band. How is it against your drums?' },
  { key: 'voiceVolume', name: 'The coach voice', ask: 'Listen to the coach. Clear, but not louder than the kit?' },
];
export const THRONE_ANSWERS = [['Too quiet', 'hi-hat × 1'], ['OK', 'snare × 1'], ['Too loud', 'floor × 1']] as const;
export const THRONE_VOICE_LINE = 'Can you hear me clearly over your drums? Answer with the hi-hat, snare or floor tom.';
/** The band's chords, one per bar: A A D E (web). */
export const THRONE_CHORDS = [45, 45, 50, 52];
export const THRONE_BEAT_MS = 60_000 / 90;

/** A pad as an answer (hi-hat too quiet, snare OK, floor too loud), or null. */
export function answerForPad(pad: PadId | undefined): number | null {
  return pad === 'hhClosed' || pad === 'hhOpen' ? 0 : pad === 'snare' ? 1 : pad === 'floor' ? 2 : null;
}
/** Keys 1–3 as answers. */
export const answerForKey = (key: string) => (/^[123]$/.test(key) ? Number(key) - 1 : null);

export type ThroneStep = { step: number; patch?: Partial<Settings>; finished: boolean; replay: boolean };

/**
 * One answer: OK moves on (the last OK sets soundChecked), too quiet / too loud nudges the level and plays again
 * (the voice is replayed; the click and band keep looping).
 */
export function throneAnswer(step: number, answer: number, s: Settings): ThroneStep {
  const st = THRONE_STEPS[step];
  if (!st) return { step, finished: true, replay: false };
  if (answer === 1) {
    const next = step + 1;
    return next >= THRONE_STEPS.length ? { step: next, patch: { soundChecked: true }, finished: true, replay: false } : { step: next, finished: false, replay: true };
  }
  return { step, patch: { [st.key]: nudgeLevel(levelOf(s, st.key), answer, st.key) }, finished: false, replay: st.key === 'voiceVolume' };
}

export const throneTitle = (step: number) => `Sound check · ${step + 1} of ${THRONE_STEPS.length}`;
export const throneAsk = (step: number, s: Settings) => {
  const st = THRONE_STEPS[step];
  return st ? `${st.ask} (now ${Math.round(levelOf(s, st.key) * 100)}%)` : '';
};
