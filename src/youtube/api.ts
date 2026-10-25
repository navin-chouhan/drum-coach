import { beatsPerBar } from '../engine/chart';
import { useEffect, useState } from 'react';
import type { Grid, YtResult, YtSong } from './schemas';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, headers: init?.body ? { 'content-type': 'application/json' } : undefined });
  } catch { throw new Error('Cannot reach the local server. Is `npm run dev` running?'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Server error ${r.status}`);
  return j as T;
}

export const searchYt = (q: string) => call<YtResult[]>(`/api/youtube/search?q=${encodeURIComponent(q)}`);
export const findVersions = (title: string) => call<{ drumless: YtResult[]; covers: YtResult[] }>(`/api/youtube/versions?title=${encodeURIComponent(title)}`);
export const saveGrid = (videoId: string, g: Grid) => call(`/api/ytgrids/${videoId}`, { method: 'PUT', body: JSON.stringify(g) }).then(refreshSongs);

let songs: YtSong[] = [];
const listeners = new Set<() => void>();
export async function refreshSongs() {
  songs = await call<YtSong[]>('/api/ytsongs');
  listeners.forEach(l => l());
}
export async function addSong(title: string, originalId: string, drumlessId?: string | null, coverId?: string | null) {
  const s = await call<YtSong>('/api/ytsongs', { method: 'POST', body: JSON.stringify({ title, originalId, drumlessId, coverId }) });
  await refreshSongs();
  return s;
}
export async function patchSong(id: string, patch: Partial<Pick<YtSong, 'title' | 'drumlessId' | 'coverId' | 'timeSignature' | 'notes'>>) {
  await call(`/api/ytsongs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  await refreshSongs();
}
export async function deleteSong(id: string) {
  await call(`/api/ytsongs/${id}`, { method: 'DELETE' });
  await refreshSongs();
}
export function useYtSongs(): [YtSong[], string] {
  const [, force] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const l = () => force(x => x + 1);
    listeners.add(l);
    refreshSongs().then(() => setError(''), e => setError(e.message));
    return () => { listeners.delete(l); };
  }, []);
  return [songs, error];
}

/** How many bars a saved song's notes span (0 without notes). */
export const songBarCount = (s: YtSong) => (s.notes.length ? Math.floor(s.notes[s.notes.length - 1].t / beatsPerBar(s)) + 1 : 0);
