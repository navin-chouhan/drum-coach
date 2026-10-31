// Interruptions in the song modes (QA m5, D6, AUDIO-DESIGN §4), as the lesson player handles them
// (features/lesson/useLesson.ts): a call, Siri or an alarm (audio 'began'), the audio engine stopping, or the app
// leaving the foreground ends what's running. A scored take is then kept, flagged, if it has ≥ 2 whole bars
// (core MIN_INTERRUPTED_BARS); a shorter one is dropped. Pure TypeScript: the screens pass React Native's AppState.
import { beatsPerBar } from '@drum-coach/core/engine/chart';
import type { BeatGrid } from '@drum-coach/core/engine/tempo';
import { MIN_INTERRUPTED_BARS } from '@drum-coach/core/play/take';
import type { YtSong } from '@drum-coach/core/youtube/schemas';

// watchInterruptions moved to src/platform/audioLifecycle.ts (every take uses it); re-exported for the song modes.
export { watchInterruptions, type AppStateLike } from '../../platform/audioLifecycle';

/** Jam has no bars of its own: an interrupted jam is kept when the song ran ≥ 2 whole bars of its grid (at `rate`). */
export function jamKeepsInterrupted(song: Pick<YtSong, 'timeSignature'>, grid: Pick<BeatGrid, 'bpm'>, rate: number, playedMs: number): boolean {
  const beats = (playedMs / 60000) * grid.bpm * rate;
  return Math.floor(beats / beatsPerBar(song) + 1e-9) >= MIN_INTERRUPTED_BARS;
}
