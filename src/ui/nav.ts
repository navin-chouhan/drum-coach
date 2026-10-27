// Tiny cross-tab navigation: "play this exercise" from the coach, plan or songs.
export type PlayRequest = { chartId: string; bpm?: number };
const listeners = new Set<(r: PlayRequest) => void>();
export const onPlayRequest = (fn: (r: PlayRequest) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const requestPlay = (r: PlayRequest) => listeners.forEach(l => l(r));

// "Open this YouTube song" from Journey or Progress.
// `bars`: open it in Play mode on those bars (a lesson's song bite).
export type SongBars = { from: number; to: number };
const songListeners = new Set<(id: string, bars?: SongBars) => void>();
export const onSongRequest = (fn: (id: string, bars?: SongBars) => void) => { songListeners.add(fn); return () => { songListeners.delete(fn); }; };
export const requestSong = (id: string, bars?: SongBars) => songListeners.forEach(l => l(id, bars));

// Concert mode (N8): the show-off set back to back; Play mode's encore offers the next song.
export const concert: { queue: { id: string; bars: SongBars }[] } = { queue: [] };
export const startConcert = (songs: { id: string; bars: SongBars }[]) => { concert.queue = songs.slice(1); if (songs[0]) requestSong(songs[0].id, songs[0].bars); };

// "Open this lesson" from Progress.
const lessonListeners = new Set<(id: string) => void>();
export const onLessonRequest = (fn: (id: string) => void) => { lessonListeners.add(fn); return () => { lessonListeners.delete(fn); }; };
export const requestLesson = (id: string) => lessonListeners.forEach(l => l(id));
