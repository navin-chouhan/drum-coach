import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'dc-yt-'));
const { sameSong, searchYouTube } = await import('./youtube');

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
function fakeFetch() {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url);
    if (url.includes('/search?')) return ok({ items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: 'Song &amp; Drumless', channelTitle: 'Chan', thumbnails: { medium: { url: 't.jpg' } } } }] });
    return ok({ items: [{ id: 'abcdefghijk', contentDetails: { duration: 'PT3M20S' } }] });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe('searchYouTube', () => {
  it('needs a key', async () => {
    await expect(searchYouTube('x', '')).rejects.toMatchObject({ status: 503 });
  });
  it('returns embeddable results with durations, then serves the cache', async () => {
    const { f, calls } = fakeFetch();
    const r = await searchYouTube('Some Song', 'KEY', f);
    expect(r).toEqual([{ id: 'abcdefghijk', title: 'Song & Drumless', channel: 'Chan', thumbnail: 't.jpg', durationSec: 200 }]);
    expect(calls[0]).toContain('videoEmbeddable=true');
    expect(calls[0]).toContain('key=KEY');
    await searchYouTube('  some song ', 'KEY', f);
    expect(calls).toHaveLength(2); // search + videos only once
  });
  it('maps quota errors', async () => {
    const f = (async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'quotaExceeded' }] } }), { status: 403 })) as unknown as typeof fetch;
    await expect(searchYouTube('other', 'KEY', f)).rejects.toMatchObject({ status: 429 });
  });
});

describe('sameSong', () => {
  const r = (title: string) => ({ title });
  it('keeps versions of this song, drops other songs by the same artist', () => {
    const got = sameSong('AC/DC - Back In Black', [r('AC/DC - Back In Black - Drumless'), r('AC/DC - Highway To Hell - Drumless'), r('Back in Black (drumless track)')]);
    expect(got.map(x => x.title)).toEqual(['AC/DC - Back In Black - Drumless', 'Back in Black (drumless track)']);
  });
  it('falls back to everything when nothing matches', () => {
    expect(sameSong('Weird title format', [r('a'), r('b')])).toHaveLength(2);
  });
});
