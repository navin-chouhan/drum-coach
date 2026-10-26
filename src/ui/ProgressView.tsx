import { useEffect, useState, useSyncExternalStore } from 'react';
import { MILESTONES } from '../content/curriculum';
import { rankState } from '../engine/planner';
import { getSettings, subscribeSettings } from '../input/settings';
import { useLessons } from '../lesson/aiLessons';
import { songBarCount, songVerified, useYtSongs } from '../youtube/api';
import { hearFill } from '../play/fills';
import { BADGES, dashboard, earnedBadges, songReady, type Dashboard, type RunRow } from '../engine/progress';
import { requestLesson, requestPlay, requestSong } from './nav';
import { TeacherView } from './TeacherView';

const ACCENT = '#2F6FE4';

export function ProgressView() {
  const [teacher, setTeacher] = useState(false); // N2: the page for a human teacher
  const [d, setD] = useState<Dashboard | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/runs').then(r => r.json()).then((runs: RunRow[]) => { setRuns(runs); setD(dashboard(runs)); })
      .catch(() => setError('Cannot reach the local server, so progress is unavailable. Is `npm run dev` running?'));
  }, []);
  // The shelf comes from local progress, so it shows even without the server.
  if (error) return <div className="progress"><TrophyShelf runs={runs} /><p className="warn">{error}</p></div>;
  if (!d) return <div className="progress"><TrophyShelf runs={runs} /><p className="small">Loading…</p></div>;

  if (teacher) return <TeacherView onBack={() => setTeacher(false)} />;
  return (
    <div className="progress">
      <div className="actions"><button onClick={() => setTeacher(true)}>👩‍🏫 For your teacher (summary, notes)</button></div>
      <TrophyShelf runs={runs} />
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
        {d.charts.length === 0 ? <p className="small">Finish a run on Practice, a lesson or a song and it shows up here.</p> : (
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
                  <td><button className="link" onClick={() => practice(c.chartId, c.best90Bpm)}>practice</button></td>
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

// Each row goes back to where it was played: a song, a lesson, or an exercise on Practice.
function practice(chartId: string, best90Bpm?: number | null) {
  if (chartId.startsWith('yt-') || chartId.startsWith('jam-yt-')) requestSong(chartId.replace(/^jam-/, ''));
  else if (chartId.startsWith('lesson/')) requestLesson(chartId.split('/')[1]);
  else requestPlay({ chartId, bpm: best90Bpm ? best90Bpm + 5 : undefined });
}

/** Ranks earned, stars, and the songs you can show off. */
function TrophyShelf({ runs }: { runs: RunRow[] }) {
  const s = useSyncExternalStore(subscribeSettings, getSettings);
  const lessons = useLessons();
  const [songs] = useYtSongs();
  const rankOf = (m: (typeof MILESTONES)[number]) => rankState(m, lessons, s.lessons, s.profile);
  const stars = Object.values(s.lessons).reduce((a, p) => a + (p.completedAt ? p.stars ?? 1 : 0), 0);
  // A show-off song: 16 bars or more, every bar played at 85% or better (across takes).
  const showoff = songs.filter(song => songVerified(song) && songReady(runs, song.id, songBarCount(song))); // N4: checked by ear
  // Journey announces new badges and stores them; the shelf also counts what the runs already earned, so it's never stale.
  const badges = new Set([...(s.badges ?? []), ...earnedBadges(runs, s.lessons, MILESTONES.map(m => m.checkpoints), undefined, showoff.map(x => x.id))]);
  return (
    <div className="card trophies">
      <h3>Trophy shelf</h3>
      <div className="stickers">
        {MILESTONES.map(m => rankOf(m).state !== 'locked'
          ? <div key={m.level} className="rankSticker small" title={`Stage ${m.level + 1}: ${m.title}${rankOf(m).state === 'proven' ? ' · proven on another day' : ` · prove it on another day (${rankOf(m).proven} of ${rankOf(m).total})`}`}>
            {m.rank}{rankOf(m).state === 'proven' ? ' ✓' : ''}</div>
          : <div key={m.level} className="rankSticker small locked" title={`Pass stage ${m.level + 1}, ${m.title}, to earn this`}>?</div>)}
      </div>
      <p><span className="stars">★</span> <b>{stars}</b> stars from your lessons</p>
      <h4>Your fills</h4>
      {s.fills?.length ? <ul className="songList">{[...s.fills].reverse().map(fl => <li key={fl.id}><span>{new Date(fl.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {fl.notes.length} notes · {fl.bpm} BPM</span><button onClick={() => hearFill(fl)}>🎧 Hear it</button></li>)}</ul>
        : <p className="small">Fills you make up in free bars and trade bars can be kept after the take. They land here.</p>}
      <h4>Badges</h4>
      <div className="stickers">
        {BADGES.map(b => <div key={b.id} className={`rankSticker small ${badges.has(b.id) ? '' : 'locked'}`} title={b.how}>{badges.has(b.id) ? `🏅 ${b.name}` : b.name}</div>)}
      </div>
      <p className="small honest">🎥 An app can hear your timing and volume, but it can't see your hands. Once a month, film yourself with
        "📷 Check yourself" in a lesson and compare with "How it moves". If you can, take one lesson with a human teacher per stage:
        they spot tension and grip habits no app can.</p>
      <h4>Show-off set</h4>
      {showoff.length ? (
        <ul className="songList">
          {showoff.map(song => <li key={song.id}><span>{song.title}</span><button className="primary" onClick={() => requestSong(song.id)}>Play it (Stage mode is under Play)</button></li>)}
        </ul>
      ) : <p className="small">Pass a stage to unlock a show-off song, then play 16 bars or more of it scored on Songs, every bar at 85% or better. It lands here, ready to play for your friends.</p>}
    </div>
  );
}
