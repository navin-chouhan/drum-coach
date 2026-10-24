/** YouTube video id from a watch / youtu.be / music.youtube.com / shorts / embed / live link, or a bare id. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let url: URL;
  try { url = new URL(s.includes('://') ? s : `https://${s}`); } catch { return null; }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  const id = host === 'youtu.be' ? url.pathname.slice(1, 12)
    : host === 'youtube.com' || host === 'youtube-nocookie.com'
      ? url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1] ?? null
      : null;
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
