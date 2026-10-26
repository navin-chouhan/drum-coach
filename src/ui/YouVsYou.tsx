import { useEffect, useState } from 'react';
import type { RunTake } from '../coach/schemas';
import { monthly, youVsYou } from '../engine/history';
import { dayKey } from '../engine/lesson';
import type { RunRow } from '../engine/progress';
import { takeChart } from '../engine/transcribe';
import type { PadId } from '../engine/kit';
import { start } from '../play/player';

type Report = { headline: string; better: string[]; next: string[]; note: string };
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Plays a kept take back (N8): only the student's own hits, as drum sounds. */
async function hear(run: RunRow) {
  const t = await (await fetch(`/api/runs/${run.id}/take`)).json() as RunTake;
  const chart = takeChart(t.hits.map(([time, pad, velocity]) => ({ time, pad: pad as PadId, velocity })),
    { zero: 0, beatMs: t.beatMs, beats: t.beats, beatsPerBar: t.beatsPerBar, title: `You, ${when(run.startedAt)}`, timeSignature: t.timeSignature });
  start(chart, { fromBar: 1, toBar: chart.bars, repeats: 1, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false, demo: true });
}

/** You vs you, over months (N8): an old take against a recent one, each month's numbers, and the coach's monthly report. */
export function YouVsYou({ runs }: { runs: RunRow[] }) {
  const [now] = useState(() => Date.now());
  const pair = youVsYou(runs, now), months = monthly(runs, now).filter((m, i, all) => m.takes || all.slice(0, i).some(x => x.takes));
  const [report, setReport] = useState<Report>(), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const ask = (again = false) => {
    setBusy(true); setErr('');
    fetch('/api/coach/month', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ again }) })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'The coach is unavailable.'); setReport(j.data); })
      .catch(e => setErr(String(e.message ?? e))).finally(() => setBusy(false));
  };
  useEffect(() => { // last report, if this month's is already written (no new call)
    fetch('/api/settings').then(r => r.json()).then(s => { if (s.monthReport?.month === dayKey(new Date()).slice(0, 7)) setReport(s.monthReport.report); }).catch(() => {});
  }, []);
  return (
    <div className="card youVsYou">
      <h3>You vs you</h3>
      {pair ? <>
        <p><b>{pair.now.chartTitle}</b>: {when(pair.then.startedAt)} vs {when(pair.now.startedAt)}.</p>
        <table className="exTable"><thead><tr><th /><th>On time</th><th>Spread</th><th>Tempo</th><th /></tr></thead><tbody>
          {([['A month ago', pair.then], ['Now', pair.now]] as const).map(([label, r]) => (
            <tr key={label}><td>{label}</td><td>{r.accuracy}%</td><td>{Math.round(r.spread)} ms</td><td>{Math.round(r.bpm)} BPM</td>
              <td><button onClick={() => void hear(r)}>🎧 Hear it</button></td></tr>))}
        </tbody></table>
        <p className="small">Listen to both: steadier spacing is the thing to hear. Lower spread = steadier.</p>
      </> : <p className="small">Keep playing: once a take is a month old, you can hear "you a month ago" against "you now" here.</p>}
      {months.length > 1 && <>
        <h4>Month by month</h4>
        <table className="exTable"><thead><tr><th>Month</th><th>Minutes</th><th>Takes</th><th>On time</th><th>Spread</th><th>Best BPM at 90%+</th></tr></thead><tbody>
          {months.map(m => <tr key={m.month}><td>{m.month}</td><td>{m.minutes}</td><td>{m.takes}</td><td>{m.takes ? `${m.accuracy}%` : '—'}</td><td>{m.takes ? `${m.spread} ms` : '—'}</td><td>{m.bestBpm || '—'}</td></tr>)}
        </tbody></table>
      </>}
      <h4>The coach's monthly report</h4>
      {report ? <div className="monthReport">
        <p><b>{report.headline}</b></p>
        {report.better.length > 0 && <><p className="small">Got better:</p><ul>{report.better.map(b => <li key={b}>{b}</li>)}</ul></>}
        {report.next.length > 0 && <><p className="small">Next month:</p><ul>{report.next.map(b => <li key={b}>{b}</li>)}</ul></>}
        <p>{report.note}</p>
        <button className="link" disabled={busy} onClick={() => ask(true)}>{busy ? 'The coach is thinking…' : 'Ask again'}</button>
      </div> : <button onClick={() => ask()} disabled={busy}>{busy ? 'The coach is thinking…' : '📝 Write this month\'s report'}</button>}
      {err && <p className="warn">{err}</p>}
    </div>
  );
}
