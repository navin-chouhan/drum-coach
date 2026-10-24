import { useEffect, useRef, useState } from 'react';
import { askCoach, Thinking, useCoachEntry } from '../coach/api';
import type { Feedback } from '../coach/schemas';
import { speakOnce } from '../coach/CoachFeedback';
import { scoreJam, type JamHit, type JamStats } from '../engine/jam';
import { WINDOWS } from '../engine/scoring';
import { PAD_INFO } from '../engine/kit';
import { beatAt, songSecAt } from '../engine/tempo';
import { onHit } from '../input/hits';
import { getSettings } from '../input/settings';
import type { ModeProps } from './SongView';

const timing = (ms: number) => (Math.abs(ms) < 5 ? 'right on the beat' : ms < 0 ? `rushing by ${-ms} ms` : `dragging by ${ms} ms`);

/** Play along with the song, no chart: timing vs the song's beat, drift and dynamics. */
export function JamMode({ song, videoId, yt, rate }: ModeProps) {
  const grid = song.grids[videoId];
  const [steps, setSteps] = useState(2);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ stats: JamStats; at: string; durationS: number } | null>(null);
  const [live, setLive] = useState<number[]>([]);
  const hits = useRef<JamHit[]>([]);
  const started = useRef({ at: '', perf: 0 });

  useEffect(() => {
    if (!running) return;
    return onHit(h => {
      if (!h.pad || !yt.playing) return;
      const songSec = yt.songTime(h.time - getSettings().latencyMs);
      hits.current.push({ songSec, pad: h.pad, velocity: h.velocity });
      const step = Math.round(beatAt(songSec, grid) * steps) / steps;
      setLive(l => [...l.slice(-15), ((songSec - songSecAt(step, grid)) * 1000) / rate]);
    });
  }, [running, yt, grid, steps, rate]);

  function start() {
    hits.current = []; setLive([]); setResult(null);
    started.current = { at: new Date().toISOString(), perf: performance.now() };
    if (yt.songTime() >= yt.duration - 5) yt.seek(0);
    yt.play(); setRunning(true);
  }
  function stop() {
    yt.pause(); setRunning(false);
    if (hits.current.length < 8) { setResult(null); return; }
    const stats = scoreJam(hits.current, grid, steps, rate);
    const durationS = Math.round((performance.now() - started.current.perf) / 1000);
    setResult({ stats, at: started.current.at, durationS });
    void fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      chartId: `jam-${song.id}`, chartTitle: `Jam · ${song.title}`.slice(0, 120), startedAt: started.current.at, durationS,
      bpm: grid.bpm * rate, speed: rate, accuracy: stats.onGridPct, meanOffset: stats.meanOffset, spread: stats.spread,
      summary: { mode: 'jam', song: song.title, ...stats },
    }) }).catch(() => {});
  }
  useEffect(() => () => yt.pause(), [yt]);

  const last = live[live.length - 1];
  return (
    <div className="card form">
      <h3>Jam along</h3>
      <p className="small">Play anything that fits the song. You're scored against the song's beat, with no chart needed.</p>
      <label className="inline">Compare with
        <select value={steps} disabled={running} onChange={e => setSteps(+e.target.value)}>
          <option value={1}>quarter notes</option><option value={2}>8th notes</option><option value={4}>16th notes</option>
        </select>
      </label>
      <div className="actions">
        <button className="primary" onClick={running ? stop : start}>{running ? 'Stop & score' : 'Start jamming'}</button>
      </div>
      {running && (
        <div>
          <div className="tempoBig" style={{ color: last === undefined ? undefined : Math.abs(last) <= 25 ? 'var(--good)' : Math.abs(last) <= 60 ? 'var(--ok)' : 'var(--bad)' }}>
            {last === undefined ? '—' : `${last > 0 ? '+' : ''}${Math.round(last)} ms`}
          </div>
          <div className="meter" aria-hidden>
            <div className="zone" /><div className="center" />
            {live.map((o, i) => <i key={i} className="tick" style={{ left: `${50 + Math.max(-49, Math.min(49, o / 2))}%`, opacity: 0.2 + (0.8 * (i + 1)) / live.length, background: 'var(--accent)' }} />)}
          </div>
        </div>
      )}
      {result && <JamResults stats={result.stats} keyId={`jam:${result.at}`} summary={{ mode: 'jam', song: song.title, bpm: Math.round(grid.bpm * rate), speedPct: Math.round(rate * 100), comparedWith: ['', 'quarters', '8ths', '', '16ths'][steps], ...result.stats }} />}
    </div>
  );
}

function JamResults({ stats: s, keyId, summary }: { stats: JamStats; keyId: string; summary: Record<string, unknown> }) {
  const e = useCoachEntry<Feedback>(keyId);
  useEffect(() => { if (e?.status === 'done' && e.data) speakOnce(keyId, e.data); }, [keyId, e?.status, e?.data]);
  return (
    <div className="jamResults">
      <div className="grid3">
        <div><div className="big">{s.onGridPct}%</div><div className="small">hits on the beat (±{WINDOWS.good} ms) · {s.perfectPct}% within ±{WINDOWS.perfect} ms</div></div>
        <div><div className="big">{timing(s.meanOffset)}</div><div className="small">consistency ±{s.spread} ms</div></div>
        <div><div className="big">{s.driftMsPerMin === null ? '—' : Math.abs(s.driftMsPerMin) < 30 ? 'steady tempo' : s.driftMsPerMin < 0 ? 'speeding up' : 'slowing down'}</div>
          <div className="small">{s.driftMsPerMin === null ? 'play 20 s or more to measure drift' : `drift ${s.driftMsPerMin} ms per minute`}</div></div>
      </div>
      <table className="exTable">
        <thead><tr><th>Drum</th><th>Hits</th><th>Timing</th><th>Consistency</th><th>Avg velocity</th><th>Velocity variation</th></tr></thead>
        <tbody>{Object.entries(s.perDrum).map(([pad, d]) => (
          <tr key={pad}><td>{PAD_INFO[pad as keyof typeof PAD_INFO].name}</td><td>{d.hits}</td><td>{timing(d.meanOffset)}</td><td>±{d.spread} ms</td><td>{d.velMean}</td><td>{d.velCv}%</td></tr>
        ))}</tbody>
      </table>
      {!e && <button className="primary" onClick={() => askCoach(keyId, 'feedback', { summary })}>Ask the coach about this jam</button>}
      {e?.status === 'thinking' && <Thinking />}
      {e?.status === 'error' && <p className="warn">{e.error}</p>}
      {e?.status === 'done' && e.data && <div className="drill"><p>{e.data.feedback}</p><b>Drill: {e.data.drill.title}</b><p>{e.data.drill.instructions}</p></div>}
    </div>
  );
}
