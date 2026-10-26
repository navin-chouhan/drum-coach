import { useEffect, useRef } from 'react';
import type { DrumId } from '../engine/kit';
import { CoachFeedback } from '../coach/CoachFeedback';
import { coachTake } from '../coach/session';
import { summarizeRun } from '../coach/summary';
import { heatSlotName, latencySuspect } from '../engine/scoring';
import { DRUM_BY_ID } from '../ui/drums';
import { HIGHWAY_LANES } from './Highway';
import type { Finished } from './player';

const laneOf = (d: string) => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d) as DrumId;
const timingText = (ms: number) => (Math.abs(ms) < 5 ? 'Right on the grid' : ms < 0 ? `Rushing by ${Math.round(-ms)} ms` : `Dragging by ${Math.round(ms)} ms`);

const saved = new WeakMap<Finished, Promise<void>>();
const [saveOk, saveFail] = [() => {}, () => console.warn('Run not saved: is the server running?')];

/** Saves a run once (wait-mode and empty runs are skipped: they'd distort progress). Resolves when it's saved. */
export function saveRun(f: Finished, extra?: Record<string, unknown>): Promise<void> {
  const s = f.stats;
  // A take of only your own bars (trade, solo) has no written notes but real playing: save it, scored on the beat (D3).
  if (f.options.wait || (s.total === 0 && !f.hits.length)) return Promise.resolve();
  const was = saved.get(f);
  if (was) return was;
  const c = f.chart as typeof f.chart & { id?: string };
  const p = fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    chartId: c.id ?? c.title, chartTitle: c.title, level: c.level, startedAt: f.startedAt, durationS: f.durationS,
    bpm: c.bpm * f.options.speed, speed: f.options.speed, accuracy: s.total ? s.accuracy : (extra?.onBeatPct as number | undefined) ?? 0, meanOffset: s.meanOffset, spread: s.spread,
    summary: { ...summarizeRun(f), ...extra },
    // N8: keep the take (own MIDI only) to replay it against a later one
    take: { beatMs: 60000 / (c.bpm * f.options.speed), beats: f.run.beats, beatsPerBar: f.run.beatsPerBar, timeSignature: c.timeSignature,
      hits: f.hits.slice(0, 4000).map(h => [Math.round((h.time - f.zero) * 10) / 10, h.pad ?? 'snare', h.velocity]) },
  }) }).then(r => (r.ok ? saveOk() : saveFail()), saveFail);
  saved.set(f, p);
  return p;
}

/** Every stroke off by the same amount: point at the latency test before the student blames their hands. */
export function LatencyHint({ f }: { f: Finished }) {
  const ms = f.options.wait ? null : latencySuspect(f.results);
  return ms === null ? null : <p className="warn">Almost every stroke landed about {Math.abs(ms)} ms {ms > 0 ? 'late' : 'early'}.
    If it felt on time to you, it's probably the setup, not your hands: run the latency test under ⚙ Setup → Pads.</p>;
}

export function Results({ f, onAgain, onBack }: { f: Finished; onAgain: () => void; onBack: () => void }) {
  const s = f.stats, wait = f.options.wait;
  useEffect(() => { saveRun(f); coachTake(f); }, [f]);
  const slotLabel = (i: number) => { const [, beat, count] = heatSlotName(i, f.stats.heat.length, f.run.beatsPerBar).split(' '); return count ?? beat; }; // "2", "&", "let"
  return (
    <div className="results">
      <div className="resultsHead">
        <div>
          <h2>{f.chart.title}</h2>
          <p className="small">{Math.round(f.chart.bpm * f.options.speed)} BPM ({Math.round(f.options.speed * 100)}%) · bars {f.options.fromBar}–{f.options.toBar} × {f.options.repeats}{wait ? ' · wait mode' : ''}{f.options.guide ? ' · play-along' : ''}</p>
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
            <p className="small">Consistency: ±{Math.round(s.spread)} ms (lower is steadier)</p>
            <LatencyHint f={f} />
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
      c.fillStyle = '#E6E6E6'; c.font = '11px system-ui'; c.textBaseline = 'middle'; c.fillText(DRUM_BY_ID[id].name, 6, i * laneH + laneH / 2);
    });
    for (let b = 0; b <= f.run.beats; b++) {
      c.strokeStyle = b % f.run.beatsPerBar === 0 ? 'rgba(255,225,77,.4)' : 'rgba(255,255,255,.07)';
      c.beginPath(); c.moveTo(left + b * pxPerBeat, 0); c.lineTo(left + b * pxPerBeat, H); c.stroke();
    }
    const beatMs = 60000 / (f.chart.bpm * f.options.speed);
    const colors = { perfect: '#4BE08A', good: '#FFE14D', miss: '#FF5A4F' };
    f.run.notes.forEach((n, i) => {
      const y = HIGHWAY_LANES.indexOf(laneOf(n.drum)) * laneH + laneH / 2, x = left + n.t * pxPerBeat;
      const r = f.results[i];
      c.strokeStyle = colors[r.judgement]; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.stroke();
      const played = r.offset ?? r.off; // an off-time stroke shows where it landed (red), it isn't an extra
      if (played !== undefined && !f.options.wait) {
        c.fillStyle = colors[r.judgement];
        c.beginPath(); c.arc(x + (played / beatMs) * pxPerBeat, y, 3.5, 0, Math.PI * 2); c.fill();
      }
    });
    if (!f.options.wait) {
      c.strokeStyle = '#FF5A4F'; c.lineWidth = 2;
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
