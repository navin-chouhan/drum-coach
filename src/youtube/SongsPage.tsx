import { useState } from 'react';
import { SongsView as ImportFiles } from '../content/SongsView';
import { parseYouTubeId } from '../engine/youtube';
import { addSong, deleteSong, searchYt, useYtSongs } from './api';
import type { YtResult } from './schemas';
import type { SongBars } from '../ui/nav';
import { SongView } from './SongView';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function SongsPage({ openId: initial, bars }: { openId?: string; bars?: SongBars }) {
  const [songs, loadError] = useYtSongs();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<YtResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(initial ?? null);
  const open = songs.find(s => s.id === openId);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    setError('');
    const id = parseYouTubeId(text);
    if (id) { // pasted a link: add it directly
      const s = await addSong(`YouTube video ${id}`, id).catch(err => { setError(err.message); return null; });
      if (s) { setOpenId(s.id); setResults(null); setQ(''); }
      return;
    }
    setBusy(true);
    try { setResults(await searchYt(text)); } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  async function pick(r: YtResult) {
    try { const s = await addSong(r.title, r.id); setOpenId(s.id); setResults(null); } catch (err) { setError((err as Error).message); }
  }

  if (open) return <SongView key={open.id} song={open} bars={open.id === initial ? bars : undefined} onBack={() => setOpenId(null)} />;

  return (
    <div className="ytPage">
      <form className="ytSearch" onSubmit={search}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a song (artist + title) or paste a YouTube link" aria-label="Search YouTube" />
        <button className="primary" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      {(error || loadError) && <p className="warn">{error || loadError}</p>}
      {results && (
        <div className="card">
          <h3>Results <button className="link right" onClick={() => setResults(null)}>close</button></h3>
          {results.length === 0 && <p className="small">Nothing found.</p>}
          <ul className="ytResults">
            {results.map(r => (
              <li key={r.id}>
                <img src={r.thumbnail} alt="" width={120} height={68} loading="lazy" />
                <span className="grow"><b>{r.title}</b><br /><span className="small">{r.channel} · {fmt(r.durationSec)}</span></span>
                <button onClick={() => pick(r)}>Learn this</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card">
        <h3>My songs</h3>
        {songs.length === 0 && <p className="small">Search for a song above to start. The app also looks for a drumless version and drum covers.</p>}
        <ul className="songList">
          {songs.map(s => (
            <li key={s.id}>
              <span><b>{s.title}</b> <span className="small">
                {s.grids[s.originalId] ? `${Math.round(s.grids[s.originalId].bpm)} BPM` : 'tempo not set'}
                {s.drumlessId ? ' · drumless ✓' : ''}{s.notes.length ? ` · ${s.notes.length} notes transcribed` : ''}</span></span>
              <span className="actions">
                <button className="primary" onClick={() => setOpenId(s.id)}>Open</button>
                <button onClick={() => confirm(`Remove "${s.title}"? Your transcription is deleted too.`) && deleteSong(s.id)} aria-label={`Remove ${s.title}`}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <details className="card">
        <summary>Import files instead (drum MIDI + audio)</summary>
        <ImportFiles />
      </details>
    </div>
  );
}
