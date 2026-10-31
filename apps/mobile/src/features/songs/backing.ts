// An imported chart's own backing audio under a take (the web's src/play/PlayView.tsx `go()` with
// src/content/charts.ts `loadBacking`): the file the student imported with the MIDI (Documents/backing/…, files.ts),
// handed to core's createTake as `options.backing`, which plays it through audio.backing (AUDIO-DESIGN §1.4, §6).
// Only the student's own local files: never YouTube audio (CLAUDE.md), and the BackingPort refuses anything but a
// local file anyway. Practice (I3) calls these; the YouTube song modes (Play, Jam) never do.
import type { BackingPort } from '@drum-coach/core/play/audioPort';
import type { TakeBacking } from '@drum-coach/core/play/take';
import { audio } from '../../platform/audio';
import { backingUri } from './files';

/** What a chart needs to have backing (StoredChart has it all; built-in exercises have none). */
export type BackingChart = { hasAudio?: boolean; audioFile?: string; syncOffsetMs?: number };

/** The web's PlayView message when the file doesn't load (the take then plays without it). */
export const BACKING_ERROR = 'Could not load the backing audio; playing without it.';

/**
 * The take's `backing` option for a chart, or undefined when it has no audio: the kept file's URI and the chart's
 * Song sync offset. Pass it as `createTake(…, { …options, backing })`. As on the web, a take with backing has no band
 * (`band: backing ? undefined : …`).
 */
export function backingFor(chart: BackingChart, uriOf: (relative: string) => string = backingUri): TakeBacking | undefined {
  if (!chart.hasAudio || !chart.audioFile) return undefined;
  return { uri: uriOf(chart.audioFile), syncOffsetMs: chart.syncOffsetMs ?? 0 };
}

/**
 * The web's `go()`: loads the file before the take so a failure shows BACKING_ERROR and the take is built without it
 * (and so gets the band again). createTake loads it again at start (that only re-opens the file), so skipping this is
 * fine too: the take then reports `state.backingError` and plays on.
 */
export async function prepareBacking(chart: BackingChart, port: BackingPort | null = audio.backing, uriOf?: (relative: string) => string): Promise<{ backing?: TakeBacking; error?: string }> {
  const backing = backingFor(chart, uriOf);
  if (!backing) return {};
  if (!port) return { error: BACKING_ERROR };
  try {
    await port.load(backing.uri);
    return { backing };
  } catch {
    return { error: BACKING_ERROR };
  }
}

// Song sync (pure, in sync.ts so play models can use it without the audio module).
export { SYNC_NUDGES, nudgeSync, syncLine } from './sync';
