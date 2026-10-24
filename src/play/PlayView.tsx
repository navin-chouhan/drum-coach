import { useEffect, useState, useSyncExternalStore } from 'react';
import { useCharts, loadBacking, refreshCharts, type StoredChart } from '../content/charts';
import { MAX_SPEED } from '../engine/progress';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { audio } from './audio';
import { NotesView } from './NotesView';
import { player, playerVersion, start, stop, subscribePlayer, type PlayOptions } from './player';
import { Results } from './Results';

const OPTS_KEY = 'drumcoach.playOptions';
type Saved = Omit<PlayOptions, 'fromBar' | 'toBar' | 'backing'> & { chartId: string };
const DEFAULTS: Saved = { chartId: 'rock-8ths', speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false, repeats: 2 };

export function PlayView({ pending }: { pending?: { chartId: string; bpm?: number } }) {
  const charts = useCharts();
  useSyncExternalStore(subscribePlayer, playerVersion);
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const [o, setO] = useState<Saved>(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(OPTS_KEY) ?? '{}') }; } catch { return DEFAULTS; }
  });
  const [section, setSection] = useState<{ from: number; to: number } | null>(null);
  const [error, setError] = useState('');
  const set = (patch: Partial<Saved>) => setO(prev => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  // "Play this" from the coach/plan/songs: select the chart and set the speed so it lands on the suggested BPM.
  const [applied, setApplied] = useState<typeof pending>();
  const target = pending && pending !== applied ? charts.find(x => x.id === pending.chartId) : undefined;
  if (pending && target) {
    setApplied(pending);
    set({ chartId: target.id, ...(pending.bpm && { speed: Math.min(MAX_SPEED, Math.max(0.5, Math.round((pending.bpm / target.bpm) * 20) / 20)) }) });
    setSection(null);
  }

  useEffect(() => () => stop(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stop(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const chart: StoredChart = charts.find(c => c.id === o.chartId) ?? charts[0];
  const from = Math.min(section?.from ?? 1, chart.bars), to = Math.min(section?.to ?? chart.bars, chart.bars);

  async function go() {
    setError('');
    let backing: PlayOptions['backing'];
    if (chart.hasAudio) {
      try { backing = { buffer: await loadBacking(chart.id, audio()), syncOffsetMs: chart.syncOffsetMs ?? 0 }; }
      catch { setError('Could not load the backing audio; playing without it.'); }
    }
    start(chart, { ...o, fromBar: from, toBar: to, backing });
  }

  async function nudge(ms: number) {
    const syncOffsetMs = (chart.syncOffsetMs ?? 0) + ms;
    await fetch(`/api/charts/${encodeURIComponent(chart.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ syncOffsetMs }) });
    await refreshCharts();
  }

  if (player.phase === 'done' && player.finished) {
    return <Results f={player.finished} onAgain={go} onBack={stop} />;
  }

  const playing = player.phase === 'playing';
  const groups = ['groove', 'rudiment', 'fill', 'exercise', 'song'] as const;
  return (
    <div className="play">
      <div className="playSide">
        <div className="card">
          <h3>Exercise</h3>
          <select value={chart.id} disabled={playing} aria-label="Exercise"
            onChange={e => { set({ chartId: e.target.value }); setSection(null); }}>
            {groups.map(g => {
              const list = charts.filter(c => (c.kind ?? 'exercise') === g);
              return list.length ? (
                <optgroup key={g} label={g[0].toUpperCase() + g.slice(1) + 's'}>
                  {list.map(c => <option key={c.id} value={c.id}>{c.level ? `L${c.level} · ` : ''}{c.title}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
          {chart.description && <p className="small">{chart.description}</p>}
          <p className="small">{chart.bpm} BPM · {chart.timeSignature.join('/')} · {chart.bars} bars{chart.source === 'ai' ? ' · made by the coach' : ''}</p>
        </div>
        <div className="card form">
          <h3>Practice</h3>
          <label><span>Speed <b>{Math.round(o.speed * 100)}%</b> · {Math.round(chart.bpm * o.speed)} BPM</span>
            <input type="range" min={0.5} max={MAX_SPEED} step={0.05} value={o.speed} disabled={playing} onChange={e => set({ speed: +e.target.value })} />
          </label>
          <div className="row2">
            <label>Bars from <input type="number" min={1} max={chart.bars} value={from} disabled={playing}
              onChange={e => setSection({ from: +e.target.value || 1, to: Math.max(to, +e.target.value || 1) })} /></label>
            <label>to <input type="number" min={from} max={chart.bars} value={to} disabled={playing}
              onChange={e => setSection({ from, to: +e.target.value || chart.bars })} /></label>
            <label>× <input type="number" min={1} max={50} value={o.repeats} disabled={playing} onChange={e => set({ repeats: Math.max(1, +e.target.value || 1) })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={o.metronome} disabled={playing} onChange={e => set({ metronome: e.target.checked })} /> Metronome</label>
          <label>Clicks per beat
            <select value={o.subdivision} disabled={playing} onChange={e => set({ subdivision: +e.target.value as 1 | 2 | 4 })}>
              <option value={1}>1 (quarters)</option><option value={2}>2 (8ths)</option><option value={4}>4 (16ths)</option>
            </select>
          </label>
          <label>Count-in
            <select value={o.countInBars} disabled={playing} onChange={e => set({ countInBars: +e.target.value })}>
              <option value={0}>none</option><option value={1}>1 bar</option><option value={2}>2 bars</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={o.wait} disabled={playing} onChange={e => set({ wait: e.target.checked })} /> Wait mode (waits for the right hit, no timing score)</label>
          <label className="check"><input type="checkbox" checked={settings.browserSounds} onChange={e => setSettings({ browserSounds: e.target.checked })} /> Browser drum sounds (turn the module down)</label>
          {settings.latencyMs !== 0 && <p className="small">Latency correction: {settings.latencyMs} ms</p>}
        </div>
        {chart.hasAudio && (
          <div className="card">
            <h3>Song sync</h3>
            <p className="small">Audio offset: <b>{chart.syncOffsetMs ?? 0} ms</b>. If the notes arrive before the music, increase it.</p>
            <div className="actions">
              {[-50, -10, 10, 50].map(ms => <button key={ms} disabled={playing} onClick={() => nudge(ms)}>{ms > 0 ? '+' : ''}{ms}</button>)}
            </div>
          </div>
        )}
        <button className="primary big" onClick={playing ? stop : go}>{playing ? 'Stop (Esc)' : 'Start'}</button>
        {error && <p className="warn">{error}</p>}
      </div>
      <section className="highwayWrap"><NotesView idle={{ chart, fromBar: from, toBar: to, bpm: chart.bpm * o.speed }} /></section>
    </div>
  );
}
