import { db } from './db.ts';

export type YtResult = { id: string; title: string; channel: string; thumbnail: string; durationSec: number };
export class YtError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }

const API = 'https://www.googleapis.com/youtube/v3';
const CACHE_MS = 24 * 3600_000;
const decode = (s: string) => s.replace(/&(#39|quot|amp|lt|gt);/g, (_, e: string) => ({ '#39': "'", quot: '"', amp: '&', lt: '<', gt: '>' })[e]!);
const isoSec = (d: string) => { const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? +(m[1] ?? 0) * 3600 + +(m[2] ?? 0) * 60 + +(m[3] ?? 0) : 0; };

/** YouTube Data API search (embeddable videos only), cached 24 h. Search costs 100 of the 10 000 daily quota units. */
export async function searchYouTube(q: string, key = process.env.YOUTUBE_API_KEY, fetchFn: typeof fetch = fetch): Promise<YtResult[]> {
  const norm = q.trim().toLowerCase();
  const hit = db.prepare('SELECT json, at FROM yt_search WHERE q = ?').get(norm) as { json: string; at: number } | undefined;
  if (hit && Date.now() - hit.at < CACHE_MS) return JSON.parse(hit.json);
  if (!key) throw new YtError(503, 'YouTube search needs YOUTUBE_API_KEY in .env (see README → YouTube setup).');

  const get = async (path: string, params: Record<string, string>) => {
    const r = await fetchFn(`${API}/${path}?${new URLSearchParams({ ...params, key })}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const reason = j?.error?.errors?.[0]?.reason ?? '';
      throw new YtError(r.status === 403 && /quota/i.test(reason) ? 429 : 502,
        reason === 'keyInvalid' ? 'The YouTube API key in .env is invalid.' : /quota/i.test(reason) ? 'YouTube search quota used up for today.' : `YouTube API error ${r.status} ${reason}`.trim());
    }
    return j;
  };
  const s = await get('search', { part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '10', q: q.trim() });
  const items: { id: { videoId: string }; snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string }; default?: { url: string } } } }[] = s.items ?? [];
  const ids = items.map(i => i.id.videoId).filter(Boolean);
  const durations = new Map<string, number>();
  if (ids.length) {
    const v = await get('videos', { part: 'contentDetails', id: ids.join(',') });
    for (const it of v.items ?? []) durations.set(it.id, isoSec(it.contentDetails?.duration ?? ''));
  }
  const out: YtResult[] = items.filter(i => i.id.videoId).map(i => ({
    id: i.id.videoId, title: decode(i.snippet.title), channel: decode(i.snippet.channelTitle),
    thumbnail: i.snippet.thumbnails.medium?.url ?? i.snippet.thumbnails.default?.url ?? '', durationSec: durations.get(i.id.videoId) ?? 0,
  }));
  db.prepare('INSERT OR REPLACE INTO yt_search (q, json, at) VALUES (?, ?, ?)').run(norm, JSON.stringify(out), Date.now());
  return out;
}

/** Search results that name the same song: every word of the song's name (after "Artist - ") is in the title. */
export function sameSong<T extends { title: string }>(songTitle: string, results: T[]): T[] {
  const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const name = words(songTitle.includes(' - ') ? songTitle.slice(songTitle.indexOf(' - ') + 3) : songTitle);
  const kept = results.filter(r => { const w = new Set(words(r.title)); return name.every(x => w.has(x)); });
  return kept.length ? kept : results; // odd title formats: better unfiltered than empty
}
