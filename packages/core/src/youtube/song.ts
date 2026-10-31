import { beatsPerBar } from '../engine/chart.ts';
import type { YtSong } from './schemas.ts';

// A YouTube song's facts both apps read (the web's src/youtube/api.ts, the iPad's songsModel). Pure.

/** Checked by ear: the notes were confirmed against the song. */
export const songVerified = (s: YtSong) => !!s.verifiedAt;
/** How many bars the transcribed notes reach (0 with no notes). */
export const songBarCount = (s: YtSong) => (s.notes.length ? Math.floor(s.notes[s.notes.length - 1].t / beatsPerBar(s)) + 1 : 0);
