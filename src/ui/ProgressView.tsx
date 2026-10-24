import { useEffect, useState } from 'react';
import { dashboard, type Dashboard, type RunRow } from '../engine/progress';
import { requestPlay } from './nav';

const ACCENT = '#2F6FE4';

export function ProgressView() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/runs').then(r => r.json()).then((runs: RunRow[]) => setD(dashboard(runs)))
      .catch(() => setError('Cannot reach the local server, so progress is unavailable. Is `npm run dev` running?'));
  }, []);
  if (error) return <div className="progress"><p className="warn">{error}</p></div>;
  if (!d) return <div className="progress"><p className="small">Loading…</p></div>;

  return (
    <div className="progress">
      <div className="tiles">
        <Tile label="Day streak" value={d.streak} />
        <Tile label="Minutes today" value={d.minutesToday} />
        <Tile label="Minutes this week" value={d.minutesWeek} />
        <Tile label="Runs saved" value={d.totalRuns} />
      </div>
      <div className="card">
        <h3>Practice minutes · last 14 days</h3>
        <MinutesChart days={d.days} />
      </div>
      <div className="card">
        <h3>By exercise</h3>
        {d.charts.length === 0 ? <p className="small">Finish a run on the Play tab and it shows up here.</p> : (
          <table className="exTable">
            <thead><tr><th>Exercise</th><th>Runs</th><th>Last accuracy</th><th>Accuracy trend (0–100%)</th><th>BPM trend</th><th>Best BPM at 90%+</th><th /></tr></thead>
            <tbody>
              {d.charts.map(c => (
                <tr key={c.chartId}>
                  <td>{c.title}</td>
                  <td>{c.runs}</td>
                  <td>{c.lastAccuracy}%</td>
                  <td><Spark values={c.points.map(p => p.accuracy)} min={0} max={100} unit="%" label={`${c.title} accuracy`} /></td>
                  <td><Spark values={c.points.map(p => p.bpm)} unit=" BPM" label={`${c.title} BPM`} /></td>
                  <td>{c.best90Bpm ?? '—'}</td>
                  <td><button className="link" onClick={() => requestPlay({ chartId: c.chartId, bpm: c.best90Bpm ? c.best90Bpm + 5 : undefined })}>practice</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return <div className="card tile"><div className="tileValue">{value}</div><div className="small">{label}</div></div>;
}

function MinutesChart({ days }: { days: Dashboard['days'] }) {
  const W = 1200, H = 190, pad = { l: 34, r: 8, t: 10, b: 22 };
  const max = Math.max(10, ...days.map(d => d.minutes));
  const top = Math.ceil(max / 10) * 10;
  const bw = (W - pad.l - pad.r) / days.length;
  const y = (m: number) => pad.t + (H - pad.t - pad.b) * (1 - m / top);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Practice minutes per day for the last 14 days">
      {[0, top / 2, top].map(v => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
          <text x={pad.l - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" className="axis">{v}</text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = pad.l + i * bw + 2, w = bw - 4, h = y(0) - y(d.minutes);
        const label = new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
        return (
          <g key={d.date}>
            <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent"><title>{`${label}: ${d.minutes} min`}</title></rect>
            {d.minutes > 0 && <path d={`M${x},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${w - 8} q4,0 4,4 v${h - 4} z`} fill={ACCENT} pointerEvents="none" />}
            {(i % 2 === 1 || i === days.length - 1) && <text x={x + w / 2} y={H - 6} textAnchor="middle" className="axis">{label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Spark({ values, min, max, unit, label }: { values: number[]; min?: number; max?: number; unit: string; label: string }) {
  const W = 140, H = 36, p = 5;
  const lo = min ?? Math.min(...values) - 5, hi = max ?? Math.max(...values) + 5;
  const x = (i: number) => (values.length === 1 ? W / 2 : p + (i / (values.length - 1)) * (W - 2 * p));
  const y = (v: number) => H - p - ((v - lo) / (hi - lo || 1)) * (H - 2 * p);
  const last = values[values.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${label}: latest ${last}${unit}`}>
      <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={7} fill="transparent"><title>{`Run ${i + 1}: ${v}${unit}`}</title></circle>)}
      <circle cx={x(values.length - 1)} cy={y(last)} r={4} fill={ACCENT} stroke="var(--panel)" strokeWidth={2} pointerEvents="none" />
    </svg>
  );
}
