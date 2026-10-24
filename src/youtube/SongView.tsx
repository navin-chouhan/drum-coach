import { useEffect, useRef, useState } from 'react';
import { findVersions, patchSong } from './api';
import { JamMode } from './JamMode';
import { LearnMode } from './LearnMode';
import { PlayMode } from './PlayMode';
import { startReducer, type Reducer } from './reducer';
import type { YtResult, YtSong } from './schemas';
import { TempoMode } from './TempoMode';
import { printSheet, SheetMusic } from '../notation/SheetMusic';
import { YtPlayer } from './yt';
import { parseYouTubeId } from '../engine/youtube';
import { stop as stopPlayer } from '../play/player';

type Version = 'originalId' | 'drumlessId' | 'coverId';
const VERSION_NAMES: Record<Version, string> = { originalId: 'Original', drumlessId: 'Drumless', coverId: 'Drum cover' };
const MODES = { tempo: '1 · Set tempo', learn: '2 · Learn by ear', jam: '3 · Jam', play: '4 · Play (scored)', sheet: '5 · Sheet music' } as const;
type Mode = keyof typeof MODES;
export type ModeProps = { song: YtSong; videoId: string; yt: YtPlayer; rate: number };

/** Re-render when the player changes state (play/pause/error). */
export function useYt(yt: YtPlayer | null) {
  const [, force] = useState(0);
  useEffect(() => yt?.onChange(() => force(x => x + 1)), [yt]);
}

export function SongView({ song, onBack }: { song: YtSong; onBack: () => void }) {
  const [version, setVersion] = useState<Version>('originalId');
  const videoId = song[version] ?? song.originalId;
  const [mode, setMode] = useState<Mode>(song.grids[song.originalId] ? 'learn' : 'tempo');
  const [rate, setRate] = useState(1);
  const [yt, setYt] = useState<YtPlayer | null>(null);
  const [reduce, setReduce] = useState<{ on: boolean; strength: number; delayMs: number; error: string }>({ on: false, strength: 0.7, delayMs: 80, error: '' });
  const host = useRef<HTMLDivElement>(null);
  const reducer = useRef<Reducer | null>(null);
  const popup = useRef<Window | null>(null);
  useYt(yt);
  useEffect(() => { if (import.meta.env.DEV) Object.assign(window, { drumCoachYt: yt }); }, [yt]);

  const [inlineKey, setInlineKey] = useState(0);
  const latest = useRef({ videoId, rate, title: song.title, id: song.id });
  useEffect(() => { latest.current = { videoId, rate, title: song.title, id: song.id }; });

  // Inline player; re-created when drum reduction ends (the popup player replaces it meanwhile).
  useEffect(() => {
    if (reduce.on) return;
    const el = document.createElement('div');
    host.current!.replaceChildren(el);
    const p = new YtPlayer(el, latest.current.videoId);
    setYt(p);
    p.ready.then(() => {
      const { title, id } = latest.current;
      if (title.startsWith('YouTube video ') && p.title) void patchSong(id, { title: p.title });
    });
    return () => { stopPlayer(); p.destroy(); };
  }, [reduce.on, inlineKey]);

  // Switching version: same player, new video, keep the chosen speed.
  useEffect(() => {
    if (!yt) return;
    void yt.ready.then(() => { yt.load(videoId); setRate(yt.setRate(latest.current.rate)); });
  }, [videoId, yt]);

  async function toggleReduce() {
    if (reduce.on) { endReduce(); return; }
    const at = yt?.songTime() ?? 0;
    const w = window.open('/yt-player.html', 'dc-yt-player', 'width=560,height=360');
    if (!w) { setReduce(r => ({ ...r, error: 'Allow pop-ups for localhost, then try again.' })); return; }
    popup.current = w;
    if (w.document.readyState !== 'complete') await new Promise(r => w.addEventListener('load', r, { once: true }));
    yt?.destroy();
    host.current!.replaceChildren(Object.assign(document.createElement('p'), { className: 'small', textContent: 'The song plays in the "song player" window (drums reduced). Keep it open.' }));
    const p = new YtPlayer(w.document.getElementById('player')!, videoId, w);
    p.heardDelaySec = reduce.delayMs / 1000;
    await p.ready;
    p.seek(at);
    setYt(p);
    try {
      reducer.current = await startReducer(reduce.strength, endReduce);
      setReduce(r => ({ ...r, on: true, error: '' }));
    } catch (e) {
      p.destroy(); w.close();
      setReduce(r => ({ ...r, on: false, error: (e as Error).message || 'Tab sharing was cancelled.' }));
      setInlineKey(k => k + 1);
    }
  }
  function endReduce() {
    reducer.current?.stop(); reducer.current = null;
    popup.current?.close(); popup.current = null;
    setReduce(r => ({ ...r, on: false }));
  }
  useEffect(() => () => { reducer.current?.stop(); popup.current?.close(); }, []);
  useEffect(() => { if (yt && reduce.on) yt.heardDelaySec = reduce.delayMs / 1000; }, [yt, reduce.on, reduce.delayMs]);

  const grid = song.grids[videoId];
  return (
    <div className="songView">
      <div className="songHead">
        <button onClick={onBack}>← Songs</button>
        <h2>{song.title}</h2>
      </div>
      <div className="songGrid">
        <div className="stack">
          <div className="videoBox" ref={host} />
          {yt?.error && <p className="warn">{yt.error}</p>}
          <div className="card">
            <div className="actions">
              <button className="primary" onClick={() => (yt?.playing ? yt.pause() : yt?.play())} disabled={!yt}>{yt?.playing ? 'Pause' : 'Play'}</button>
              <label className="inline">Speed
                <select value={rate} onChange={e => yt && setRate(yt.setRate(+e.target.value))}>
                  {[0.5, 0.75, 1].map(r => <option key={r} value={r}>{r * 100}%</option>)}
                </select>
              </label>
              <span className="small">{grid ? `${Math.round(grid.bpm * rate)} BPM · ${song.timeSignature.join('/')}` : 'Tempo not set for this version'}</span>
            </div>
          </div>
          <Versions song={song} version={version} onVersion={v => { stopPlayer(); setVersion(v); }} />
          {version !== 'drumlessId' && (
            <div className="card">
              <h3>Reduce drums (experimental)</h3>
              <p className="small">Turns the drums down live when there's no drumless version. Opens a small "song player" window; Chrome then asks
                which tab to share: pick <b>Drum Coach – song player</b> and keep "Also share tab audio" on. Drums get quieter, not gone.</p>
              <div className="actions"><button onClick={toggleReduce}>{reduce.on ? 'Stop reducing' : 'Reduce drums'}</button></div>
              {reduce.on && (
                <div className="form">
                  <label>Strength {Math.round(reduce.strength * 100)}%
                    <input type="range" min={0} max={1} step={0.05} value={reduce.strength}
                      onChange={e => { const s = +e.target.value; reducer.current?.setStrength(s); setReduce(r => ({ ...r, strength: s })); }} /></label>
                  <label>Sound delay {reduce.delayMs} ms (raise it if your hits score late)
                    <input type="range" min={0} max={300} step={10} value={reduce.delayMs} onChange={e => setReduce(r => ({ ...r, delayMs: +e.target.value }))} /></label>
                </div>
              )}
              {reduce.error && <p className="warn">{reduce.error}</p>}
            </div>
          )}
        </div>
        <div className="stack">
          <nav className="tabs modeTabs">
            {(Object.keys(MODES) as Mode[]).map(m => (
              <button key={m} className={mode === m ? 'on' : ''} onClick={() => { stopPlayer(); yt?.pause(); setMode(m); }}
                disabled={m !== 'tempo' && !grid} title={m !== 'tempo' && !grid ? 'Set the tempo first' : undefined}>{MODES[m]}</button>
            ))}
          </nav>
          {yt && (mode === 'tempo' || !grid) && <TempoMode song={song} videoId={videoId} yt={yt} rate={rate} />}
          {yt && grid && mode === 'learn' && <LearnMode song={song} videoId={videoId} yt={yt} rate={rate} />}
          {yt && grid && mode === 'jam' && <JamMode song={song} videoId={videoId} yt={yt} rate={rate} />}
          {yt && grid && mode === 'play' && <PlayMode song={song} videoId={videoId} yt={yt} rate={rate} />}
          {grid && mode === 'sheet' && <SongSheet song={song} bpm={grid.bpm} />}
        </div>
      </div>
    </div>
  );
}

function Versions({ song, version, onVersion }: { song: YtSong; version: Version; onVersion: (v: Version) => void }) {
  const [found, setFound] = useState<{ drumless: YtResult[]; covers: YtResult[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState('');
  async function find() {
    setBusy(true); setError('');
    try { setFound(await findVersions(song.title)); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }
  const use = (key: 'drumlessId' | 'coverId', id: string) => patchSong(song.id, { [key]: id }).then(() => onVersion(key));
  return (
    <div className="card">
      <h3>Versions</h3>
      <div className="actions">
        {(Object.keys(VERSION_NAMES) as Version[]).map(v => (
          <button key={v} className={version === v ? 'on' : ''} disabled={!song[v]} onClick={() => onVersion(v)}>
            {VERSION_NAMES[v]}{song[v] && song.grids[song[v]!] ? '' : song[v] ? ' (no tempo)' : ''}
          </button>
        ))}
        <button onClick={find} disabled={busy}>{busy ? 'Searching…' : 'Find drumless & covers'}</button>
      </div>
      <p className="small">Learn by ear on the original (or a drum cover), then play along on the drumless version.</p>
      <form className="row2" onSubmit={e => { e.preventDefault(); const id = parseYouTubeId(link); if (id) { void use('drumlessId', id); setLink(''); } else setError('That is not a YouTube link.'); }}>
        <input value={link} onChange={e => setLink(e.target.value)} placeholder="…or paste a drumless video link" aria-label="Drumless video link" />
        <button>Use</button>
      </form>
      {error && <p className="warn">{error}</p>}
      {found && (['drumless', 'covers'] as const).map(kind => (
        <div key={kind}>
          <h4>{kind === 'drumless' ? 'Drumless versions' : 'Drum covers'}</h4>
          <ul className="ytResults compact">
            {found[kind].slice(0, 5).map(r => (
              <li key={r.id}>
                <img src={r.thumbnail} alt="" width={80} height={45} loading="lazy" />
                <span className="grow small"><b>{r.title}</b><br />{r.channel}</span>
                <button onClick={() => use(kind === 'drumless' ? 'drumlessId' : 'coverId', r.id)}>Use</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SongSheet({ song, bpm }: { song: YtSong; bpm: number }) {
  if (!song.notes.length) return <div className="card"><h3>Sheet music</h3><p className="small">Transcribe some bars in "Learn by ear" and they appear here as drum notation.</p></div>;
  return (
    <div className="card">
      <h3>Sheet music <button className="link right" onClick={printSheet}>Print / save as PDF</button></h3>
      <div className="printTarget"><SheetMusic notes={song.notes} timeSignature={song.timeSignature} title={song.title} bpm={bpm} /></div>
      <p className="small">Your transcription so far. x = cymbals/hi-hat, o = open hi-hat, (note) = ghost note, &gt; = accent; feet stems point down.</p>
    </div>
  );
}
