// Practice's metronome-only mode (just the click, no take, no score): its tempo, meter and clicks per beat, remembered
// between visits. The clicks come from the take engine's planner (createMetronome, an endless spec: AUDIO-DESIGN §2.3).
// The web has no separate metronome; the tempo range is the prototype's (prototype/drum-stage.html: 40–240 BPM).
import type { KeyValueStore } from '@drum-coach/core/platform';

export const METRONOME_KEY = 'drumcoach.metronome';
export const MIN_BPM = 40, MAX_BPM = 240;
export type MetronomeSettings = { bpm: number; beatsPerBar: number; subdivision: 1 | 2 | 4 };
export const METRONOME_DEFAULTS: MetronomeSettings = { bpm: 80, beatsPerBar: 4, subdivision: 1 };

export const clampBpm = (bpm: number) => Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
/** − / + by 5, or by 1 for fine steps. */
export const nudgeBpm = (bpm: number, by: number) => clampBpm(bpm + by);
/** Clicks per bar, the first one accented. */
export const METERS = [2, 3, 4, 5, 6, 7] as const;
export const SUBDIVISIONS: { value: 1 | 2 | 4; label: string }[] = [{ value: 1, label: 'Quarters' }, { value: 2, label: '8ths' }, { value: 4, label: '16ths' }];

export function readMetronome(kv: Pick<KeyValueStore, 'get'>): MetronomeSettings {
  try {
    const s = JSON.parse(kv.get(METRONOME_KEY) ?? '{}') as Partial<MetronomeSettings>;
    return {
      bpm: clampBpm(typeof s.bpm === 'number' ? s.bpm : METRONOME_DEFAULTS.bpm),
      beatsPerBar: METERS.includes(s.beatsPerBar as never) ? s.beatsPerBar! : METRONOME_DEFAULTS.beatsPerBar,
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
