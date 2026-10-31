// Practice's metronome-only mode (just the click, no take, no score): its tempo, meter and clicks per beat, remembered
// between visits. The clicks come from the take engine's planner (createMetronome, an endless spec: AUDIO-DESIGN §2.3).
// The web has no separate metronome; the tempo range is the prototype's (prototype/drum-stage.html: 40–240 BPM).
import { beatsPerBar } from '@drum-coach/core/engine/chart';
import { isOdd8 } from '@drum-coach/core/engine/meter';
import type { KeyValueStore } from '@drum-coach/core/platform';

export const METRONOME_KEY = 'drumcoach.metronome';
export const MIN_BPM = 40, MAX_BPM = 240;
export type Meter = readonly [number, number];
export type MetronomeSettings = { bpm: number; timeSignature: Meter; subdivision: 1 | 2 | 4 };
export const METRONOME_DEFAULTS: MetronomeSettings = { bpm: 80, timeSignature: [4, 4], subdivision: 1 };

export const clampBpm = (bpm: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
/** − / + by 5, or by 1 for fine steps. */
export const nudgeBpm = (bpm: number, by: number) => clampBpm(bpm + by);
/**
 * The meters the web offers for a song's click (src/youtube/TempoMode.tsx SIGS), simple ones first, then the /8 ones.
 * The click is core's planner: a compound meter (6/8, 12/8) clicks its quarter-note beats (6/8 → 3 a bar, as a 6/8
 * lesson clicks), an odd one (7/8) every 8th, accenting each group (2+2+3). The first click of a bar is higher.
 */
export const METERS: readonly Meter[] = [[2, 4], [3, 4], [4, 4], [5, 4], [6, 8], [7, 8], [12, 8]];
export const meterLabel = (m: Meter) => `${m[0]}/${m[1]}`;
const meterOf = (label: unknown) => METERS.find(m => meterLabel(m) === label);
/** Clicks in a bar (the dots): beats, or 8ths in an odd /8 meter. */
export const clicksPerBar = (m: Meter) => (isOdd8(m) ? m[0] : beatsPerBar({ timeSignature: m }));
/** Which click of the bar is sounding, from the metronome's position in beats (−1 before beat 0). */
export function clickInBar(m: Meter, pos: number): number {
  if (pos < 0) return -1;
  const n = clicksPerBar(m), perBeat = isOdd8(m) ? 2 : 1;
  return Math.floor(pos * perBeat + 1e-6) % n;
}
export const SUBDIVISIONS: { value: 1 | 2 | 4; label: string }[] = [{ value: 1, label: 'Quarters' }, { value: 2, label: '8ths' }, { value: 4, label: '16ths' }];

export function readMetronome(kv: Pick<KeyValueStore, 'get'>): MetronomeSettings {
  try {
    const s = JSON.parse(kv.get(METRONOME_KEY) ?? '{}') as Partial<MetronomeSettings> & { beatsPerBar?: unknown };
    // a meter saved before /8 meters were offered was clicks per bar in quarters
    const ts = Array.isArray(s.timeSignature) ? meterOf(meterLabel(s.timeSignature as unknown as Meter)) : meterOf(`${String(s.beatsPerBar)}/4`);
    return {
      bpm: clampBpm(typeof s.bpm === 'number' ? s.bpm : METRONOME_DEFAULTS.bpm),
      timeSignature: ts ?? METRONOME_DEFAULTS.timeSignature,
      subdivision: s.subdivision === 2 || s.subdivision === 4 ? s.subdivision : 1,
    };
  } catch { return METRONOME_DEFAULTS; }
}
export function writeMetronome(kv: KeyValueStore, s: MetronomeSettings) {
  try { kv.set(METRONOME_KEY, JSON.stringify(s)); } catch { /* kept for this session */ }
}

/** Tap tempo: the median gap of the last taps (2 s or less apart) as BPM, or undefined with fewer than 3 taps. */
export function tapTempo(taps: number[]): number | undefined {
  const recent: number[] = [];
  for (let i = taps.length - 1; i > 0 && recent.length < 6; i--) {
    const gap = taps[i] - taps[i - 1];
    if (gap <= 0 || gap > 2000) break;
    recent.push(gap);
  }
  if (recent.length < 2) return undefined;
  const sorted = recent.sort((a, b) => a - b);
  return clampBpm(60_000 / sorted[sorted.length >> 1]);
}
