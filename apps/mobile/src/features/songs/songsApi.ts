// YouTube search through the home server (the Data API key stays there: CLAUDE.md), as the web's src/youtube/api.ts
// searchYt / findVersions. The iPad stores the songs itself (songsRepo.ts); only search needs the server, so when
// it's unreachable the screens say so and pasting a link still works.
import type { YtResult } from '@drum-coach/core/youtube/schemas';
import { z } from 'zod';
import type { ApiFailure, HomeServer } from '../../platform/contracts';

const ResultSchema = z.object({ id: z.string().regex(/^[\w-]{11}$/), title: z.string(), channel: z.string(), thumbnail: z.string(), durationSec: z.number() });
const ResultsSchema = z.array(ResultSchema);
const VersionsSchema = z.object({ drumless: ResultsSchema, covers: ResultsSchema });

export type SearchOutcome<T> = { ok: true; data: T } | { ok: false; error: string; unreachable: boolean };

/** What a failed server call means for Songs (the web shows the server's own `error` text when it has one). */
export function songsFailureText(f: ApiFailure): string {
  switch (f.reason) {
    case 'not-configured': return 'Search needs the home server: add it in Setup → Coach. You can still paste a YouTube link.';
    case 'unreachable': return "Can't reach the home server, so search is off. You can still paste a YouTube link.";
    case 'unauthorized': return 'The home server refused the token: check it in Setup → Coach.';
    case 'forbidden': return 'The home server refused this request.';
    case 'rate-limited': return 'Too many searches for now: try again in a minute.';
    default: return f.detail || `Server error${f.status ? ` ${f.status}` : ''}`;
  }
}

async function get<T>(server: HomeServer, path: `/api/${string}`, schema: z.ZodType<T>): Promise<SearchOutcome<T>> {
  const r = await server.call<unknown>('GET', path);
  if (!r.ok) return { ok: false, error: songsFailureText(r), unreachable: r.reason === 'unreachable' || r.reason === 'not-configured' };
  const p = schema.safeParse(r.data);
  return p.success ? { ok: true, data: p.data } : { ok: false, error: 'The server answered with something unexpected.', unreachable: false };
}

export const searchYt = (server: HomeServer, q: string) =>
  get<YtResult[]>(server, `/api/youtube/search?q=${encodeURIComponent(q)}`, ResultsSchema);
export const findVersions = (server: HomeServer, title: string) =>
  get<{ drumless: YtResult[]; covers: YtResult[] }>(server, `/api/youtube/versions?title=${encodeURIComponent(title)}`, VersionsSchema);

/** The web's duration format (SongsPage fmt): 3:07. */
export const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
