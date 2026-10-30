// The Songs list and song view, as view models: the web's src/youtube/SongsPage.tsx and SongView.tsx decisions
// (wording, which mode opens, which versions and modes are on), without React. Pure TypeScript (Vitest-tested).
import { beatsPerBar } from '@drum-coach/core/engine/chart';
import { parseYouTubeId } from '@drum-coach/core/engine/youtube';
import type { YtSong } from '@drum-coach/core/youtube/schemas';

export type Version = 'originalId' | 'drumlessId' | 'coverId';
export const VERSIONS: Version[] = ['originalId', 'drumlessId', 'coverId'];
export const VERSION_NAMES: Record<Version, string> = { originalId: 'Original', drumlessId: 'Drumless', coverId: 'Drum cover' };
export const MODES = { tempo: '1 · Set tempo', learn: '2 · Learn by ear', jam: '3 · Jam', play: '4 · Play (scored)', sheet: '5 · Sheet music' } as const;
export type Mode = keyof typeof MODES;
export const MODE_IDS = Object.keys(MODES) as Mode[];
/** Bars a song is opened at (from the Journey, a bite lesson or a concert). */
export type SongBars = { from: number; to: number };

/** api.ts songVerified / songBarCount. */
export const songVerified = (s: YtSong) => !!s.verifiedAt;
export const songBarCount = (s: YtSong) => (s.notes.length ? Math.floor(s.notes[s.notes.length - 1].t / beatsPerBar(s)) + 1 : 0);

/** "My songs" row: the title and the web's small line (tempo · drumless ✓ · notes transcribed). */
export function songRow(s: YtSong) {
  const g = s.grids[s.originalId];
  return {
    id: s.id, title: s.title,
    detail: `${g ? `${Math.round(g.bpm)} BPM` : 'tempo not set'}${s.drumlessId ? ' · drumless ✓' : ''}${s.notes.length ? ` · ${s.notes.length} notes transcribed` : ''}`,
    removeQuestion: `Remove "${s.title}"? Your transcription is deleted too.`,
  };
}
export const EMPTY_SONGS = 'Search for a song above to start. The app also looks for a drumless version and drum covers.';
export const SEARCH_PLACEHOLDER = 'Search a song (artist + title) or paste a YouTube link';

/** What the search box does with its text: a pasted link adds the video at once, anything else searches. */
export function searchAction(text: string): { kind: 'none' } | { kind: 'add'; videoId: string; title: string } | { kind: 'search'; q: string } {
  const q = text.trim();
  if (!q) return { kind: 'none' };
  const id = parseYouTubeId(q);
  return id ? { kind: 'add', videoId: id, title: `YouTube video ${id}` } : { kind: 'search', q };
}
/** A song added from a pasted link takes the video's real title once the player knows it (SongView). */
export const needsTitle = (s: YtSong, playerTitle: string) => s.title.startsWith('YouTube video ') && !!playerTitle;

/** The mode a song opens in: Set tempo until the original has a grid, Play when opened at bars, else Learn. */
export const initialMode = (s: YtSong, bars?: SongBars): Mode => (!s.grids[s.originalId] ? 'tempo' : bars ? 'play' : 'learn');
export const videoOf = (s: YtSong, v: Version) => s[v] ?? s.originalId;

/** The mode tabs: every mode but Set tempo needs this version's tempo. */
export const modeTabs = (s: YtSong, videoId: string) => MODE_IDS.map(m => {
  const off = m !== 'tempo' && !s.grids[videoId];
  return { id: m, label: MODES[m], disabled: off, hint: off ? 'Set the tempo first' : undefined };
});
/** The mode actually shown (Set tempo while there's no grid). */
export const shownMode = (s: YtSong, videoId: string, mode: Mode): Mode => (mode !== 'tempo' && !s.grids[videoId] ? 'tempo' : mode);

/** The Versions buttons: off where there's no such version; "(no tempo)" where it has no grid yet. */
export const versionButtons = (s: YtSong) => VERSIONS.map(v => {
  const id = s[v];
  return { id: v, label: `${VERSION_NAMES[v]}${id && s.grids[id] ? '' : id ? ' (no tempo)' : ''}`, disabled: !id };
});
export const VERSIONS_HINT = 'Learn by ear on the original (or a drum cover), then play along on the drumless version.';
export const NOT_A_LINK = 'That is not a YouTube link.';

/** The line under the transport: tempo × speed and the time signature. */
export const tempoLine = (s: YtSong, videoId: string, rate: number) => {
  const g = s.grids[videoId];
  return g ? `${Math.round(g.bpm * rate)} BPM · ${s.timeSignature.join('/')}` : 'Tempo not set for this version';
};
export const SPEEDS = [0.5, 0.75, 1] as const;

/**
 * B13: iOS can't capture YouTube's audio (no tab capture, and a WKWebView's audio can't be tapped), so the web's
 * "Song audio (experimental)" card (drums down, suggested notes) is off on the iPad, with the reason.
 */
export const TAB_CAPTURE = {
  available: false,
  title: 'Song audio (experimental)',
  reason: "Turning the drums down and suggesting notes from the song need the song's audio. On the iPad, YouTube plays inside its own player and iOS doesn't let apps listen to it, so these are only in the web app (Chrome on the laptop). Drumless uploads work here: find one under Versions.",
  suggestHint: 'Suggested notes need the song audio, which only the web app can connect.',
} as const;

/** The concert queue (the web's ui/nav concert): Progress starts a set of show-off songs; each encore offers the next. */
export type ConcertSong = { id: string; bars: SongBars };
export const concert: { queue: ConcertSong[] } = { queue: [] };
/** Starts a concert: returns the first song to open (the rest wait in the queue). */
export function startConcert(songs: ConcertSong[]): ConcertSong | undefined {
  concert.queue = songs.slice(1);
  return songs[0];
}
/** The route that opens a song (app/song/[id].tsx), optionally at bars. */
export const songHref = (id: string, bars?: SongBars) =>
  `/song/${encodeURIComponent(id)}${bars ? `?from=${bars.from}&to=${bars.to}` : ''}`;
/** Parses the route's bars (both whole numbers ≥ 1, to ≥ from), else none. */
export function barsParam(from: unknown, to: unknown): SongBars | undefined {
  const f = Number(from), t = Number(to);
  return Number.isInteger(f) && Number.isInteger(t) && f >= 1 && t >= f ? { from: f, to: t } : undefined;
}
