// Setup's "get your kit ready" logic (web: src/ui/Calibrate.tsx rows): which checks are done, which one to do first
// (latency, when it was never measured), and why ("your last 5 takes all landed about 0.1 s after the click"). The
// iPad shows these as grouped lists (mockup setup.png); this keeps the web's order, wording and "do this first".
import type { RunRow } from '@drum-coach/core/engine/progress';
import { lateTakes } from '@drum-coach/core/engine/progress';
import type { KitCalibration } from '@drum-coach/core/engine/padCal';
import type { Settings } from '@drum-coach/core/input/settings';
import { shortDate } from '../latency/latencyByRoute';

export type CheckId = 'latency' | 'pads' | 'velocity' | 'sound' | 'hand' | 'kit';
export type Check = { id: CheckId; done: boolean; title: string; time?: string; text: string; why?: string; first: boolean };

type Input = { settings: Settings; padCal: KitCalibration; runs: RunRow[]; device: string | null };

export function setupChecks({ settings: s, padCal, runs, device }: Input): Check[] {
  const late = lateTakes(runs);
  const padCount = Object.keys(padCal).length;
  const rows: Omit<Check, 'first'>[] = [
    { id: 'latency', done: !!s.latencyChecked, title: 'Latency', time: '1 min',
      text: s.latencyChecked ? `Measured: the app takes ${s.latencyMs} ms off every hit. Measure again if you change speakers or headphones.`
        : 'Tap a pad with the click 16 times. The app learns how late your speakers or headphones are and corrects every score.',
      why: !s.latencyChecked && late ? `Your last ${late.of} takes ${late.takes === late.of ? 'all ' : ''}landed about ${(late.ms / 1000).toFixed(1)} s after the click. If that's the setup, this fixes it.` : undefined },
    { id: 'pads', done: !!s.padsCheckedAt || !!s.setupDone, title: 'Hit each pad once', time: '30 s',
      text: `So a hit on tom 1 counts as tom 1. Worth redoing after you change a note on the module.${s.padsCheckedAt ? ` Last checked ${shortDate(s.padsCheckedAt)}.` : ''}` },
    { id: 'velocity', done: padCount > 0, title: 'Soft, then loud', time: '2 min',
      text: padCount ? `Done for ${padCount} pad${padCount === 1 ? '' : 's'}: accents and ghost notes are judged the same on each of them.`
        : 'Four soft and four loud strokes per pad, so accents and ghost notes are judged fairly on every pad.' },
    { id: 'sound', done: soundDone(s), title: 'Sound levels', time: '1 min', text: `${levelsLine(s)}. Check them from the throne with a simple beat.` },
    { id: 'hand', done: true, title: 'Which hand leads', text: 'Hints, intro slides and How it moves follow this. Scoring doesn\'t change.' },
    { id: 'kit', done: !!device, title: 'Kit connected',
      text: device ? `${device}.` : 'Plug the kit into the iPad\'s USB-C port. The touch pads work meanwhile.' },
  ];
  // Only latency can be "do this first" (web: first = !latencyChecked, shown on the first open row).
  const firstOpen = [...rows.filter(r => !r.done), ...rows.filter(r => r.done)].find(r => !r.done)?.id;
  return rows.map(r => ({ ...r, first: r.id === 'latency' && !s.latencyChecked && firstOpen === 'latency' }));
}

/** Not done first, then done, keeping the order (web). */
export const orderedChecks = (rows: Check[]) => [...rows.filter(r => !r.done), ...rows.filter(r => r.done)];
export const doneCount = (rows: Check[]) => rows.filter(r => r.done).length;

/** The web's rule: the sound check finished, or any level moved from its default. */
export const soundDone = (s: Settings) => !!s.soundChecked || s.clickVolume !== 1 || s.voiceVolume !== 1 || s.bandVolume !== undefined;

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** "Click and music 100% · coach voice 100% · band 60%" (web). */
export const levelsLine = (s: Settings) => `Click and music ${pct(s.clickVolume)} · coach voice ${pct(s.voiceVolume)} · band ${pct(s.bandVolume ?? 0.6)}`;
/** The short form on the Sound levels row (mockup): "click 125% · band 60% · coach voice 45%". */
export const levelsShort = (s: Settings) => `click ${pct(s.clickVolume)} · band ${s.band === false ? 'off' : pct(s.bandVolume ?? 0.6)} · coach voice ${pct(s.voiceVolume)}`;

/**
 * The first run's kit step is unchecked (web App.tsx kit chip: !setupDone || !latencyChecked): what the nag says,
 * or null when both are done.
 */
export function kitNag(s: Settings): string | null {
  if (s.setupDone && s.latencyChecked) return null;
  return `${s.setupDone ? 'Latency' : 'Pads and latency'} not checked yet`;
}
