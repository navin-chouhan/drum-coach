import { useEffect, useRef, useState } from 'react';
import { beatsPerBar } from '../engine/chart';
import { alignPhase, beatAt, fitBeatGrid, type BeatGrid } from '../engine/tempo';
import { onHit } from '../input/hits';
import { getSettings } from '../input/settings';
import { audio, click } from '../play/audio';
import { patchSong, saveGrid } from './api';
import type { ModeProps } from './SongView';
import type { YtSong } from './schemas';

const SIGS: YtSong['timeSignature'][] = [[4, 4], [3, 4], [6, 8], [12, 8], [2, 4], [5, 4], [7, 8]];

/** Tap the beat (any pad or key) while the song plays → beat grid for this video. */
export function TempoMode({ song, videoId, yt }: ModeProps) {
  const bpb = beatsPerBar(song);
  const saved = song.grids[videoId];
  const known = Object.values(song.grids)[0]; // another version's tempo: then a few taps set the phase
  const [taps, setTaps] = useState<number[]>([]);
  const [draft, setDraft] = useState<BeatGrid | null>(null);
  const [check, setCheck] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => onHit(h => {
    if (!yt.playing) return;
    const t = yt.songTime(h.time - getSettings().latencyMs);
    setDraft(null);
    setTaps(prev => (prev.length && t - prev[prev.length - 1] > 3 ? [t] : [...prev, t].slice(-48)));
  }), [yt]);

  const fit = taps.length >= 8 ? fitBeatGrid(taps, bpb) : known && !saved && taps.length >= 2 ? alignPhase(taps, known.bpm, bpb) : null;
  const shown = draft ?? fit ?? saved ?? null;

  // Click on every beat over the song so you can check the grid by ear.
  const lastBeat = useRef(-1);
  useEffect(() => {
    if (!check || !shown) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!yt.playing) return;
      const b = Math.floor(beatAt(yt.songTime(), shown));
      if (b !== lastBeat.current && b >= 0) click(audio().currentTime + 0.005, b % Math.round(bpb) === 0 ? 0 : 1);
      lastBeat.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [check, shown, yt, bpb]);

  const adjust = (f: (g: BeatGrid) => BeatGrid) => shown && setDraft(f(shown));
  const beatSec = shown ? 60 / shown.bpm : 0;
  async function save() {
    if (!shown) return;
    const bar = beatSec * bpb;
    const offsetSec = ((shown.offsetSec % bar) + bar) % bar;
    await saveGrid(videoId, { bpm: shown.bpm, offsetSec });
    setDraft(null); setTaps([]); setMsg('Saved. Now try Learn by ear or Jam.');
  }

  return (
    <div className="card form">
      <h3>Set tempo</h3>
      <p className="small">Press <b>Play</b>, then hit any pad (or a key) on every beat, starting on a "1" (the start of a bar).
        {known && !saved ? ' This song already has a tempo from another version, so 2–4 taps are enough.' : ' About 8–16 taps.'} Pause between tries to start over.</p>
      <label className="inline">Time signature
        <select value={song.timeSignature.join('/')} onChange={e => void patchSong(song.id, { timeSignature: SIGS.find(s => s.join('/') === e.target.value) })}>
          {SIGS.map(s => <option key={s.join('/')}>{s.join('/')}</option>)}
        </select>
      </label>
      <div className="tempoBig">
        {shown ? <>{shown.bpm.toFixed(1)} <span className="small">BPM · downbeat at {shown.offsetSec.toFixed(2)} s</span></> : <span className="small">Taps: {taps.length}</span>}
        {fit && 'residualMs' in fit && <div className="small">{taps.length} taps · ±{(fit as { residualMs: number }).residualMs} ms {(fit as { residualMs: number }).residualMs > 30 ? '(uneven: keep tapping)' : '(steady)'}</div>}
      </div>
      {shown && (
        <>
          <div className="actions">
            <button onClick={() => adjust(g => ({ ...g, offsetSec: g.offsetSec - 0.01 }))}>−10 ms</button>
            <button onClick={() => adjust(g => ({ ...g, offsetSec: g.offsetSec + 0.01 }))}>+10 ms</button>
            <button onClick={() => adjust(g => ({ ...g, bpm: Math.round((g.bpm - 0.1) * 10) / 10 }))}>−0.1 BPM</button>
            <button onClick={() => adjust(g => ({ ...g, bpm: Math.round((g.bpm + 0.1) * 10) / 10 }))}>+0.1 BPM</button>
            <button onClick={() => adjust(g => ({ ...g, offsetSec: g.offsetSec + beatSec }))} title="The 1 is one beat later">"1" is later</button>
            <button onClick={() => adjust(g => ({ ...g, bpm: g.bpm * 2 }))}>×2</button>
            <button onClick={() => adjust(g => ({ ...g, bpm: g.bpm / 2 }))}>÷2</button>
          </div>
          <label className="check"><input type="checkbox" checked={check} onChange={e => setCheck(e.target.checked)} /> Click along so I can check it (accent = bar start)</label>
          <div className="actions"><button className="primary" onClick={() => void save()}>Save tempo</button><button onClick={() => { setTaps([]); setDraft(null); }}>Clear taps</button></div>
        </>
      )}
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}
