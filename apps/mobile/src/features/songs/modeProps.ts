// What every song mode panel gets from the song screen (the web's ModeProps), plus the iPad's platform pieces.
import type { HitBus } from '@drum-coach/core/input/hits';
import type { YtSong } from '@drum-coach/core/youtube/schemas';
import type { YtController } from '../../youtube';
import type { SongBars } from './songsModel';

export type ModeProps = {
  song: YtSong;
  videoId: string;
  yt: YtController;
  rate: number;
  bars?: SongBars;
  /** The app's Clock (hits are stamped on it). */
  now: () => number;
  bus: HitBus;
  latencyMs: number;
  /** A drum or click sound now (AudioPort.playNow); silent when the audio module isn't there. */
  sound: (id: `drum.${string}` | 'click.bar' | 'click.beat', gain: number) => void;
};
