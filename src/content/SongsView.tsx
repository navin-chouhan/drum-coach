import { useState } from 'react';
import { CHART_DRUMS } from '../engine/chart';
import type { ImportResult } from '../engine/midiImport';
import { requestPlay } from '../ui/nav';
import { refreshCharts, saveChart, useCharts } from './charts';

export function SongsView() {
  const charts = useCharts();
  const [parsed, setParsed] = useState<ImportResult & { file: string }>();
  const [title, setTitle] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const songs = charts.filter(c => c.source !== 'builtin');

  async function onMidi(f: File | undefined) {
    setError(''); setParsed(undefined);
    if (!f) return;
    try {
      const { midiToChart } = await import('../engine/midiImport'); // @tonejs/midi stays out of the main bundle
      const r = midiToChart(new Uint8Array(await f.arrayBuffer()), f.name.replace(/\.midi?$/i, ''));
      setParsed({ ...r, file: f.name }); setTitle(r.chart.title);
    } catch (e) { setError(`Couldn't read ${f.name}: ${(e as Error).message}`); }
  }

  async function save() {
    if (!parsed) return;
    setBusy(true); setError('');
    try {
      const c = await saveChart({ ...parsed.chart, title: title.trim() || parsed.chart.title }, 'import');
      if (audioFile) {
        const r = await fetch(`/api/charts/${c.id}/audio`, { method: 'PUT', headers: { 'content-type': audioFile.type || 'audio/mpeg' }, body: audioFile });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Audio upload failed');
        await refreshCharts();
      }
      setParsed(undefined); setAudioFile(null);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Its audio file is deleted too.`)) return;
    await fetch(`/api/charts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshCharts();
  }

  const counts = parsed && CHART_DRUMS.map(d => [d, parsed.chart.notes.filter(n => n.drum === d).length] as const).filter(([, n]) => n);
  return (
    <div className="songs grid2">
      <div className="card form">
        <h3>Import a song</h3>
        <label>Drum MIDI file (.mid) <input type="file" accept=".mid,.midi,audio/midi" onChange={e => onMidi(e.target.files?.[0])} /></label>
        <label>Backing audio, optional (MP3/OGG/WAV) <input type="file" accept="audio/*" onChange={e => setAudioFile(e.target.files?.[0] ?? null)} /></label>
        <p className="small">The MIDI file should contain a drum track on channel 10. The audio should start at the same moment as the MIDI;
          you can fine-tune the offset on the Play tab while playing (Song sync).</p>
        {error && <p className="warn">{error}</p>}
        {parsed && counts && (
          <>
            <label>Title <input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} /></label>
            <p className="small">{parsed.chart.bpm} BPM · {parsed.chart.timeSignature.join('/')} · {parsed.chart.bars} bars · {parsed.chart.notes.length} notes
              {parsed.ignored > 0 && ` · ${parsed.ignored} notes skipped (percussion this kit doesn't have)`}</p>
            <p className="small">{counts.map(([d, n]) => `${d} ${n}`).join(' · ')}</p>
            <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save to library'}</button>
          </>
        )}
      </div>
      <div className="card">
        <h3>Your library</h3>
        {songs.length === 0 && <p className="small">No songs or coach exercises yet.</p>}
        <ul className="songList">
          {songs.map(c => (
            <li key={c.id}>
              <span><b>{c.title}</b> <span className="small">{c.source === 'ai' ? 'coach exercise' : 'song'} · {c.bpm} BPM · {c.bars} bars{c.hasAudio ? ' · 🔊 audio' : ''}</span></span>
              <span className="actions">
                <button onClick={() => requestPlay({ chartId: c.id })}>Play</button>
                <button onClick={() => remove(c.id, c.title)} aria-label={`Delete ${c.title}`}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
