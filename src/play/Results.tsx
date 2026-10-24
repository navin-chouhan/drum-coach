import { useEffect, useRef } from 'react';
import type { DrumId } from '../engine/kit';
import { CoachFeedback } from '../coach/CoachFeedback';
import { summarizeRun } from '../coach/summary';
import { DRUM_BY_ID } from '../ui/drums';
import { HIGHWAY_LANES } from './Highway';
import type { Finished } from './player';

const laneOf = (d: string) => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d) as DrumId;
const COUNT = ['1', 'e', '&', 'a'];
const timingText = (ms: number) => (Math.abs(ms) < 5 ? 'Right on the grid' : ms < 0 ? `Rushing by ${-ms} ms` : `Dragging by ${ms} ms`);

const saved = new WeakSet<Finished>();
const [saveOk, saveFail] = [() => {}, () => console.warn('Run not saved: is the server running?')];

/** Saves a run once (wait-mode and empty runs are skipped: they'd distort progress). */
export function saveRun(f: Finished, extra?: Record<string, unknown>) {
  const s = f.stats;
  if (f.options.wait || saved.has(f) || s.total === 0) return;
  saved.add(f);
  const c = f.chart as typeof f.chart & { id?: string };
  void fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    chartId: c.id ?? c.title, chartTitle: c.title, level: c.level, startedAt: f.startedAt, durationS: f.durationS,
    bpm: c.bpm * f.options.speed, speed: f.options.speed, accuracy: s.accuracy, meanOffset: s.meanOffset, spread: s.spread,
    summary: { ...summarizeRun(f), ...extra },
  }) }).then(r => (r.ok ? saveOk() : saveFail()), saveFail);
}

export function Results({ f, onAgain, onBack }: { f: Finished; onAgain: () => void; onBack: () => void }) {
  const s = f.stats, wait = f.options.wait;
  useEffect(() => saveRun(f), [f]);
  const slotLabel = (i: number) => (i % 4 === 0 ? String(i / 4 + 1) : COUNT[i % 4]);
  return (
    <div className="results">
      <div className="resultsHead">
        <div>
          <h2>{f.chart.title}</h2>
          <p className="small">{Math.round(f.chart.bpm * f.options.speed)} BPM ({Math.round(f.options.speed * 100)}%) · bars {f.options.fromBar}–{f.options.toBar} × {f.options.repeats}{wait ? ' · wait mode' : ''}</p>
        </div>
        <div className="actions">
          <button className="primary" onClick={onAgain}>Play again</button>
          <button onClick={onBack}>Back</button>
        </div>
      </div>
      <div className="grid3">
        <div className="card">
          <h3>Accuracy</h3>
          <div className="big">{wait ? `${s.extra} wrong` : `${s.accuracy}%`}</div>
          {!wait && <p className="small"><span className="perfect">{s.perfect} perfect</span> · <span className="good">{s.good} good</span> · <span className="miss">{s.miss} missed</span> · {s.extra} extra</p>}
          {wait && <p className="small">Wait mode doesn't score timing. {s.total} notes played.</p>}
        </div>
        {!wait && (
          <div className="card">
            <h3>Timing</h3>
            <div className="big">{timingText(s.meanOffset)}</div>
            <p className="small">Consistency: ±{s.spread} ms (lower is steadier)</p>
          </div>
        )}
        <div className="card">
          <h3>Dynamics</h3>
          <div className="big">{s.velocity.normalMean || '—'}</div>
          <p className="small">
            Average velocity · variation {s.velocity.normalCv}%
            {s.velocity.accentMean !== null && <> · accents {s.velocity.accentMean}</>}
            {s.velocity.ghostMean !== null && <> · ghosts {s.velocity.ghostMean}</>}
          </p>
        </div>
      </div>
      {!wait && (
        <div className="grid2">
          <div className="card">
            <h3>Per drum</h3>
            {Object.entries(s.perDrum).map(([d, v]) => (
              <div className="row" key={d}>
                <span>{d === 'hhOpen' ? 'Hi-hat open' : d === 'hhPedal' ? 'Hi-hat foot' : DRUM_BY_ID[laneOf(d)].name}</span>
                <span className="bar"><i style={{ width: `${v.accuracy}%`, background: DRUM_BY_ID[laneOf(d)].color }} /></span>
                <span className="n">{v.accuracy}%</span>
              </div>
            ))}
          </div>
          <div className="card">
            <h3>Where in the bar</h3>
            <div className="heat" style={{ gridTemplateColumns: `repeat(${s.heat.length}, 1fr)` }}>
              {s.heat.map((c, i) => {
                const miss = c.total ? c.miss / c.total : 0, err = Math.min(1, c.meanAbsOffset / 60);
                const bad = Math.min(1, miss * 1.6 + err * 0.8);
                return (
                  <div key={i} className="cell" title={c.total ? `${c.total} notes · ${c.miss} missed · avg ±${c.meanAbsOffset} ms` : 'no notes'}
                    style={{ background: c.total ? `hsl(${140 - 140 * bad} 60% ${30 + 10 * (1 - bad)}%)` : 'var(--panel2)' }}>
                    <span>{slotLabel(i)}</span>
                  </div>
                );
              })}
            </div>
            <p className="small">Green = solid, red = missed or off-time. Hover a cell for details.</p>
          </div>
        </div>
      )}
      {f.cues.length > 0 && (
        <div className="card">
          <h3>Tips during this take</h3>
          <ul className="tips">{f.cues.map((c, i) => <li key={i}>{c.text}</li>)}</ul>
        </div>
      )}
      <div className="card">
        <h3>Replay · expected (rings) vs played (dots), extra hits ✕</h3>
        <Replay f={f} />
      </div>
      {!wait && <CoachFeedback f={f} />}
    </div>
  );
}

function Replay({ f }: { f: Finished }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!, c = cv.getContext('2d')!;
    const pxPerBeat = 48, laneH = 20, left = 70;
    const W = left + f.run.beats * pxPerBeat + 20, H = HIGHWAY_LANES.length * laneH + 10;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    HIGHWAY_LANES.forEach((id, i) => {
      c.fillStyle = i % 2 ? 'transparent' : 'rgba(255,255,255,.03)'; c.fillRect(0, i * laneH, W, laneH);
      c.fillStyle = '#C9D8E8'; c.font = '11px system-ui'; c.textBaseline = 'middle'; c.fillText(DRUM_BY_ID[id].name, 6, i * laneH + laneH / 2);
    });
    for (let b = 0; b <= f.run.beats; b++) {
      c.strokeStyle = b % f.run.beatsPerBar === 0 ? 'rgba(242,213,122,.4)' : 'rgba(255,255,255,.07)';
      c.beginPath(); c.moveTo(left + b * pxPerBeat, 0); c.lineTo(left + b * pxPerBeat, H); c.stroke();
    }
    const beatMs = 60000 / (f.chart.bpm * f.options.speed);
    const colors = { perfect: '#8FD1A8', good: '#F2D57A', miss: '#E8836B' };
    f.run.notes.forEach((n, i) => {
      const y = HIGHWAY_LANES.indexOf(laneOf(n.drum)) * laneH + laneH / 2, x = left + n.t * pxPerBeat;
      const r = f.results[i];
      c.strokeStyle = colors[r.judgement]; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.stroke();
      if (r.offset !== undefined && !f.options.wait) {
        c.fillStyle = colors[r.judgement];
        c.beginPath(); c.arc(x + (r.offset / beatMs) * pxPerBeat, y, 3.5, 0, Math.PI * 2); c.fill();
      }
    });
    if (!f.options.wait) {
      c.strokeStyle = '#E8836B'; c.lineWidth = 2;
      for (const h of f.extras) {
        const lane = h.pad ? HIGHWAY_LANES.indexOf(laneOf(h.pad.startsWith('hh') ? 'hihat' : h.pad)) : -1;
        if (lane < 0) continue;
        const x = left + ((h.time - f.zero) / beatMs) * pxPerBeat, y = lane * laneH + laneH / 2;
        c.beginPath(); c.moveTo(x - 4, y - 4); c.lineTo(x + 4, y + 4); c.moveTo(x + 4, y - 4); c.lineTo(x - 4, y + 4); c.stroke();
      }
    }
  }, [f]);
  return <div className="replay"><canvas ref={ref} /></div>;
}
