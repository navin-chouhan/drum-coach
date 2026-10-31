// The songs as the screens read them: Storage's songs and charts repos with a change signal (the web's api.ts
// refreshSongs/useYtSongs and charts.ts useCharts, on the device). Every write goes through here so every screen
// that shows songs re-renders.
import type { YtSong } from '@drum-coach/core/youtube/schemas';
import { useMemo, useSyncExternalStore } from 'react';
import type { StoredChart } from '../../data/songs';
import { getStorage } from '../../platform/storage';

let version = 0;
const listeners = new Set<() => void>();
const bump = () => { version++; listeners.forEach(l => l()); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/** Null when the database couldn't be opened (the screens then say why). */
export const songsStore = () => {
  const s = getStorage();
  return s.songs && s.charts ? { songs: s.songs, charts: s.charts } : null;
};
export const STORAGE_DOWN = (why: string | null) => `Songs can't be saved on this iPad right now${why ? ` (${why})` : ''}.`;

/** Runs a write and tells the screens; errors come back as text. */
export function songsWrite<T>(f: (s: NonNullable<ReturnType<typeof songsStore>>) => T): { ok: true; value: T } | { ok: false; error: string } {
  const s = songsStore();
  if (!s) return { ok: false, error: STORAGE_DOWN(getStorage().openError) };
  try {
    const value = f(s);
    bump();
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function useSongsVersion() {
  return useSyncExternalStore(subscribe, () => version);
}
export function useYtSongs(): YtSong[] {
  const v = useSongsVersion();
  return useMemo(() => songsStore()?.songs.list() ?? [], [v]); // eslint-disable-line react-hooks/exhaustive-deps -- v is the songs' version: re-read on each save
}
export function useSong(id: string): YtSong | null {
  const v = useSongsVersion();
  return useMemo(() => songsStore()?.songs.get(id) ?? null, [id, v]); // eslint-disable-line react-hooks/exhaustive-deps -- v is the songs' version: re-read on each save
}
export function useStoredCharts(): StoredChart[] {
  const v = useSongsVersion();
  return useMemo(() => songsStore()?.charts.list() ?? [], [v]); // eslint-disable-line react-hooks/exhaustive-deps -- v is the songs' version: re-read on each save
}
