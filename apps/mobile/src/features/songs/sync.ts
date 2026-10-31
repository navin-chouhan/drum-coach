// Song sync (the web's PlayView "⚙ More"): nudge where beat 0 is in an imported chart's own audio file. Pure.
import type { ChartsRepo } from '../../data/songs';

type BackingChart = { hasAudio?: boolean; syncOffsetMs?: number };

/** The web's nudge buttons, in ms. */
export const SYNC_NUDGES = [-50, -10, 10, 50] as const;

/** "Song sync: 120 ms. If the notes arrive before the music, increase it." (only for a chart with audio). */
export const syncLine = (chart: BackingChart) => (chart.hasAudio ? `Song sync: ${chart.syncOffsetMs ?? 0} ms. If the notes arrive before the music, increase it.` : '');

/** The web's nudge(): stores the chart's offset + ms (PATCH /api/charts/:id). Returns the new offset, or null when the chart is gone or it's out of range. */
export function nudgeSync(charts: Pick<ChartsRepo, 'setSyncOffset'>, chart: BackingChart & { id: string }, ms: number): number | null {
  const next = (chart.syncOffsetMs ?? 0) + ms;
  try {
    return charts.setSyncOffset(chart.id, next) ? next : null;
  } catch {
    return null; // past ±60 s (SongInputError)
  }
}
