import { useEffect, useState, useSyncExternalStore } from 'react';
import { cleanSongTitle } from '../engine/youtube';
import { MILESTONES } from '../content/curriculum';
import { checkpointsOf, currentMilestone, rankState } from '../engine/planner';
import { getSettings, subscribeSettings } from '../input/settings';
import { lessonById, useLessons } from '../lesson/aiLessons';
import { today } from '../lesson/state';
import { songBarCount, songVerified, useYtSongs } from '../youtube/api';
import { hearFill } from '../play/fills';
import { badgeProgress, barsReady, dashboard, landedByDay, progressLine, songReady, weekTheme, type Dashboard, type RunRow } from '../engine/progress';
import { skillGroups } from '../engine/skills';
import { thisWeeksPlan, useWeekPlan } from '../coach/weekPlan';
import { requestLesson, requestPlay, requestSong, startConcert } from './nav';
import { TeacherView } from './TeacherView';
import { YouVsYou } from './YouVsYou';

const ACCENT = '#2F6FE4', GOOD = '#1E9E5A';
const DAY = 86_400_000;
const dayName = (d: string, style: 'short' | 'long' = 'short') => new Date(`${d}T12:00:00`).toLocaleDateString('en', { weekday: style });
const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en', { day: 'numeric', month: 'short' });

/**
 * Progress: are you getting better (notes landed per day, in the coach's words), this week against your goal, the
 * skill map, trophies with how far each one is, what's coming up, your time and your lessons in plain words.
 */
export function ProgressView() {
  const [teacher, setTeacher] = useState(false), [month, setMonth] = useState(false); // N2: the page for a human teacher; N8: the month's report
  const [d, setD] = useState<Dashboard | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState('');
  const [allLessons, setAllLessons] = useState(false);
  const s = useSyncExternalStore(subscribeSettings, getSettings);
  const lessons = useLessons();
  const [songs] = useYtSongs();
  useWeekPlan();
  useEffect(() => {
    fetch('/api/runs').then(r => r.json()).then((runs: RunRow[]) => { setRuns(runs); setD(dashboard(runs)); })
      .catch(() => setError('Cannot reach the local server, so progress is unavailable. Is `npm run dev` running?'));
  }, []);
  if (teacher) return <TeacherView onBack={() => setTeacher(false)} />;
  if (error || !d) return <div className="prog"><p className={error ? 'warn' : 'small'}>{error || 'Loading…'}</p></div>;

  // Getting better: the last 10 days you played
  const days = landedByDay(runs).slice(-10);
  const notes = runs.reduce((a, r) => a + (r.notes ?? 0), 0), landed = runs.reduce((a, r) => a + Math.round(((r.notes ?? 0) * r.accuracy) / 100), 0);
  const best = runs.reduce<RunRow | undefined>((b, r) => (!b || r.accuracy > b.accuracy ? r : b), undefined);
  const stars = Object.values(s.lessons).reduce((a, p) => a + (p.completedAt ? p.stars ?? 1 : 0), 0);
  const first = runs[0]?.startedAt.slice(0, 10), playedDays = new Set(runs.map(r => r.startedAt.slice(0, 10))).size;
  const totalMin = Math.round(runs.reduce((a, r) => a + r.durationS, 0) / 60);
  // This week, Monday to Sunday
  const now = new Date(), mon = new Date(now); mon.setHours(12, 0, 0, 0); mon.setDate(mon.getDate() - ((now.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => new Date(mon.getTime() + i * DAY).toLocaleDateString('sv'));
  const weekMin = Math.round(runs.filter(r => week.includes(new Date(r.startedAt).toLocaleDateString('sv'))).reduce((a, r) => a + r.durationS, 0) / 60);
  const goal = s.profile.minutesPerDay;
  const focus = thisWeeksPlan()?.focus ?? weekTheme(runs)?.words;
  const milestone = currentMilestone(MILESTONES, lessons, s.lessons, s.profile);
  const passed = MILESTONES.filter(m => { const c = checkpointsOf(m, lessons, s.profile); return c.length > 0 && c.every(l => s.lessons[l.id]?.completedAt); });
  const path = MILESTONES.filter(m => checkpointsOf(m, lessons, s.profile).length);
  // Skill map
  const takes: Record<string, number> = {};
  for (const r of runs) if (r.chartId.startsWith('lesson/')) { const id = r.chartId.split('/')[1]; takes[id] = (takes[id] ?? 0) + 1; }
  const groups = skillGroups(lessons, s.lessons, today(), takes, milestone?.level);
  // Trophies: earned first, then the three closest with how far you are
  const showoff = songs.filter(song => songVerified(song) && songReady(runs, song.id, songBarCount(song))); // N4: checked by ear
  const bestSongBars = Math.max(0, ...songs.map(song => barsReady(runs, song.id, songBarCount(song))));
  const badges = badgeProgress(runs, s.lessons, MILESTONES.map(m => m.checkpoints), undefined, showoff.map(x => x.id), bestSongBars);
  const got = badges.filter(b => b.done || s.badges?.includes(b.id)), open = badges.filter(b => !got.includes(b)).sort((a, b) => b.value / b.max - a.value / a.max);
  const ranks = MILESTONES.map(m => ({ m, r: rankState(m, lessons, s.lessons, s.profile) })).filter(x => x.r.state !== 'locked');
  // You vs you needs a take from 28 days ago
  const vsFrom = first && shortDate(new Date(Date.parse(`${first}T12:00:00`) + 28 * DAY).toLocaleDateString('sv'));
  const vsReady = !!first && now.getTime() - Date.parse(`${first}T12:00:00`) >= 28 * DAY;
  // Your lessons: each lesson step you played, latest first
  const rows = d.charts.filter(c => c.chartId.startsWith('lesson/')).map(c => {
    const id = c.chartId.split('/')[1], l = lessonById(id), p = s.lessons[id], lastDate = c.points.at(-1)?.date ?? '';
    return { c, id, l, best: Math.round(Math.max(...c.points.map(x => x.accuracy))), last: Math.round(c.lastAccuracy), lastDate,
      bpm: p && !p.completedAt ? p.bpm : c.points.at(-1)?.bpm, started: l?.steps[0].bpm.start };
  }).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  const ago = (date: string) => { const n = Math.round((Date.parse(`${today()}T12:00:00`) - Date.parse(`${date.slice(0, 10)}T12:00:00`)) / DAY); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n < 7 ? dayName(date.slice(0, 10)) : shortDate(date.slice(0, 10)); };

  return (
    <div className="prog">
      <div className="progHead"><h2>Your progress</h2>
        {first && <p>Since {dayName(first)} {shortDate(first)} · {playedDays} day{playedDays === 1 ? '' : 's'} · {runs.length} takes · {totalMin >= 60 ? `${Math.floor(totalMin / 60)} h ${totalMin % 60} min` : `${totalMin} min`}</p>}
        <span className="sp" />
        <button aria-expanded={month} onClick={() => setMonth(!month)}>📝 This month's report</button>
        <button onClick={() => setTeacher(true)}>🧑‍🏫 For your teacher</button>
      </div>
      {month && <YouVsYou runs={runs} />}

      <div className="progRow2">
        <div className="card">
          <h3>Getting better</h3>
          <div className="coachSays"><div className="avatar" aria-hidden>🥁</div><p>{progressLine(days)}</p></div>
          <div className="better">
            <div className="chart">{days.length > 0 && <LandedChart days={days} />}<p className="small">Notes landed, per day you played. Hover a bar for the takes.</p></div>
            <div className="tiles3">
              <div><b>{landed.toLocaleString('en')}</b><span>notes landed of {notes.toLocaleString('en')}</span></div>
              {best && <div><b>{Math.round(best.accuracy)}%</b><span>best take ({best.chartTitle.split(' · ').at(-1)})</span></div>}
              <div><b>★ {stars}</b><span>stars from lessons</span></div>
            </div>
          </div>
        </div>
        <div className="card weekCard">
          <h3>This week</h3>
          <div className="weekDots">{week.map((day, i) => { const on = runs.some(r => new Date(r.startedAt).toLocaleDateString('sv') === day);
            return <span key={day} title={`${dayName(day, 'long')}${on ? ': played' : ''}`}><i className={`${on ? 'on' : ''} ${day === now.toLocaleDateString('sv') ? 'today' : ''}`}>{on ? '🔥' : ''}</i>{'MTWTFSS'[i]}</span>; })}</div>
          <p><span className="big1">{d.streak}</span> <b>day{d.streak === 1 ? '' : 's'} in a row</b></p>
          <div><p><b>{weekMin} of {goal * 7} minutes</b> <span className="small">(your {goal} a day)</span></p>
            <div className="minBar"><i style={{ width: `${Math.min(100, (100 * weekMin) / (goal * 7))}%` }} /></div></div>
          {focus && <p className="weekFocus">🎯 Focus: <b>{focus}</b></p>}
          <p className="small">{passed.length ? passed[passed.length - 1].rank : 'New drummer'}{milestone && ` · Stage ${path.indexOf(milestone) + 1} · ${milestone.title}`}</p>
        </div>
      </div>

      <div className="card">
        <div className="skHead"><h3>Skill map</h3><span className="small">Every lesson trains one or more of these. Your coach plans your weeks from it.</span></div>
        {([['Working on now', groups.now], ['Next on your path', groups.next]] as const).map(([name, ks]) => ks.length > 0 && <div key={name}>
          <div className="grpLbl">{name}</div>
          {ks.map(k => (
            <div key={k.id} className="skill">
              <span><b>{k.name}</b><span className="what">{k.what}</span></span>
              <span className="track" role="img" aria-label={`${k.lessons.done} of ${k.lessons.all} lessons done, ${k.started} started`} title={`${k.lessons.done} of ${k.lessons.all} lessons done, ${k.started} started`}>
                <span className="done" style={{ width: `${(100 * k.lessons.done) / Math.max(1, k.lessons.all)}%` }} />
                {k.started > 0 && <span className="started" style={{ width: `${Math.max(2, (100 * k.started) / Math.max(1, k.lessons.all))}%` }} />}</span>
              <span className="n">{k.lessons.done} of {k.lessons.all} lessons{k.started ? ` · ${k.started} started` : ''}<em>{k.takes ? `${k.takes} take${k.takes === 1 ? '' : 's'} so far` : 'not started'}</em>
                {k.due && k.reviewLesson && <button className="link" onClick={() => requestLesson(k.reviewLesson)}>🔁 Refresh</button>}</span>
            </div>
          ))}
        </div>)}
        {groups.later.length > 0 && <><div className="grpLbl">Later</div>
          <div className="laterChips">{groups.later.map(k => <span key={k.id}>{k.name} <small>{k.lessons.done} of {k.lessons.all}</small></span>)}</div></>}
      </div>

      <div className="progRow3">
        <div className="card trophies">
          <h3>Trophies</h3>
          {got.length || ranks.length ? <div className="earned">
            {ranks.map(({ m, r }) => <span key={m.level} className="medal" title={`Stage ${m.level + 1}: ${m.title}${r.state === 'proven' ? ' · proven on another day' : ` · prove it on another day (${r.proven} of ${r.total})`}`}><i>🎖</i>{m.rank}{r.state === 'proven' ? ' ✓' : ''}</span>)}
            {got.map(b => <span key={b.id} className="medal" title={b.how}><i>🏅</i>{b.name}</span>)}
          </div> : <p><b>None yet. Your first one is the closest below.</b></p>}
          {open.length > 0 && <div className="grpLbl">Closest</div>}
          {open.slice(0, 3).map(b => (
            <div key={b.id} className="tro"><span className="ic" aria-hidden>🏅</span>
              <span><b>{b.name}</b><span className="how">{b.how}</span><span className="pb" role="img" aria-label={b.words}><i style={{ width: `${(100 * b.value) / b.max}%` }} /></span></span>
              <span className="num">{b.words}</span></div>
          ))}
          {(open.length > 3 || ranks.length < MILESTONES.length) && <p className="small">Later: {[...open.slice(3).map(b => b.name), ...(MILESTONES.length > ranks.length ? [`+ ${MILESTONES.length - ranks.length} rank trophies`] : [])].join(' · ')}</p>}
        </div>
        <div className="card comingUp">
          <h3>Coming up</h3>
          <div className="upItem"><span className="ic" aria-hidden>🎤</span><span><b>Show-off set</b>
            {showoff.length ? <><ul className="songList">{showoff.map(song => <li key={song.id}><span>{cleanSongTitle(song.title)}</span><button className="primary" onClick={() => requestSong(song.id)}>▶ Play it</button></li>)}</ul>
              {showoff.length > 1 && <button className="primary" onClick={() => startConcert(showoff.map(song => ({ id: song.id, bars: { from: 1, to: songBarCount(song) } })))}>🎤 Concert: the whole set</button>}</>
              : <p>Pass a stage, then play 16 bars or more of its song with every bar at 85% or better. It lands here, ready to play for a friend.</p>}</span></div>
          <div className="upItem"><span className="ic" aria-hidden>🥁</span><span><b>Your fills</b>
            {s.fills?.length ? <ul className="songList">{[...s.fills].reverse().map(fl => <li key={fl.id}><span>{shortDate(fl.at.slice(0, 10))} · {fl.notes.length} notes · {fl.bpm} BPM</span><button onClick={() => hearFill(fl)}>🎧 Hear it</button></li>)}</ul>
              : <p>Fills you make up in free bars can be kept after the take. They land here.</p>}</span></div>
          <div className="upItem"><span className="ic" aria-hidden>⏪</span><span><b>You vs you</b>
            <p>{vsReady ? 'Ready' : `From ${vsFrom ?? 'a month after your first take'}`}: hear "you a month ago" against "you now" on the same groove.</p>
            {vsReady && <button className="primary" onClick={() => setMonth(true)}>▶ Open it</button>}</span></div>
        </div>
      </div>

      <div className="card"><h3>Your time</h3><div className="chart"><MinutesChart days={d.days} goal={goal} /></div></div>

      {rows.length > 0 && <div className="card">
        <h3>Your lessons</h3>
        <table className="lessonsTable">
          <thead><tr><th>Lesson</th><th>Takes</th><th>Best</th><th>Last</th><th>Tempo now</th><th>Played</th><th /></tr></thead>
          <tbody>{(allLessons ? rows : rows.slice(0, 8)).map(x => (
            <tr key={x.c.chartId}><td><b>{x.c.title}</b></td><td>{x.c.runs}</td><td>{x.best}%</td><td>{x.last}%</td>
              <td>{x.bpm ?? '—'}{x.bpm ? ' BPM' : ''}{x.started && x.bpm && x.started !== x.bpm && s.lessons[x.id] && !s.lessons[x.id].completedAt ? <small> (started at {x.started})</small> : null}</td>
              <td>{ago(x.lastDate)}</td><td><button onClick={() => practice(x.c.chartId, x.c.best90Bpm)}>Practise ▶</button></td></tr>
          ))}</tbody>
        </table>
        {rows.length > 8 && <button className="link" onClick={() => setAllLessons(!allLessons)}>{allLessons ? 'Show fewer' : `Show all ${rows.length}`}</button>}
        {d.charts.length > rows.length && <p className="small">Practice exercises and songs: {d.charts.filter(c => !c.chartId.startsWith('lesson/')).map(c => <button key={c.chartId} className="link" onClick={() => practice(c.chartId, c.best90Bpm)}>{c.title}</button>).reduce<React.ReactNode[]>((a, b, i) => (i ? [...a, ' · ', b] : [b]), [])}</p>}
      </div>}

      <div className="human"><span className="ic" aria-hidden>🎥</span><span>An app hears your timing and volume but can't see your hands. Once a month, film yourself with
        📷 Check yourself and compare with How it moves. If you can, one lesson with a human teacher per stage spots what no app can.</span></div>
    </div>
  );
}

/** Notes landed per day played: one series, one axis, the value on each bar, a tooltip with the takes. */
function LandedChart({ days }: { days: { date: string; pct: number; takes: number }[] }) {
  const W = 640, H = 230, L = 34, B = 28, slot = (W - L) / Math.max(days.length, 7), bw = Math.min(56, slot - 10);
  const y = (v: number) => H - B - ((H - B - 14) * v) / 100;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Notes landed per day you played, in percent">
      {[0, 50, 100].map(v => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="#0002" /><text className="ax" x={L - 6} y={y(v) + 4} textAnchor="end">{v}%</text></g>)}
      {days.map((d, i) => {
        const x = L + slot * i + (slot - bw) / 2, top = y(d.pct);
        return <g key={d.date} className="bar"><title>{`${dayName(d.date)} ${shortDate(d.date)}: ${d.pct}% of notes landed, ${d.takes} take${d.takes === 1 ? '' : 's'}`}</title>
          <rect x={L + slot * i} y={14} width={slot} height={H - B - 14} fill="transparent" />
          {d.pct > 0 ? <path d={`M${x},${H - B}V${top + 4}q0,-4 4,-4h${bw - 8}q4,0 4,4V${H - B}Z`} fill={ACCENT} /> : <rect x={x} y={H - B - 3} width={bw} height={3} fill="#0002" />}
          <text className="val" x={x + bw / 2} y={top - 6} textAnchor="middle">{d.pct}%</text>
          <text className="ax" x={x + bw / 2} y={H - 8} textAnchor="middle">{dayName(d.date)} {new Date(`${d.date}T12:00:00`).getDate()}</text></g>;
      })}
    </svg>
  );
}

/** Minutes per day for the last 14 days against your daily goal (a dashed line); a day at the goal is green. */
function MinutesChart({ days, goal }: { days: Dashboard['days']; goal: number }) {
  const W = 900, H = 170, L = 34, B = 26, top = Math.max(goal + 10, Math.ceil(Math.max(...days.map(d => d.minutes)) / 10) * 10);
  const slot = (W - L) / days.length, bw = slot - 8, y = (v: number) => H - B - ((H - B - 10) * v) / top;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Minutes played per day, last 14 days, against your goal of ${goal} a day`}>
      {Array.from({ length: Math.floor(top / 10) + 1 }, (_, k) => k * 10).map(v => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="#0001" /><text className="ax" x={L - 6} y={y(v) + 4} textAnchor="end">{v}</text></g>)}
      {days.map((d, i) => {
        const x = L + slot * i + 4;
        return <g key={d.date} className="bar"><title>{`${dayName(d.date)} ${shortDate(d.date)}: ${d.minutes} min`}</title>
          <rect x={L + slot * i} y={10} width={slot} height={H - B - 10} fill="transparent" />
          {d.minutes > 0 ? <path d={`M${x},${H - B}V${y(d.minutes) + 4}q0,-4 4,-4h${bw - 8}q4,0 4,4V${H - B}Z`} fill={d.minutes >= goal ? GOOD : ACCENT} />
            : <rect x={x} y={H - B - 3} width={bw} height={3} fill="#0002" />}
          <text className="ax" x={x + bw / 2} y={H - 8} textAnchor="middle">{new Date(`${d.date}T12:00:00`).getDate()}</text></g>;
      })}
      <line x1={L} x2={W} y1={y(goal)} y2={y(goal)} stroke="#141414" strokeWidth={2} strokeDasharray="6 5" />
      <text x={W - 4} y={y(goal) - 6} textAnchor="end" fontSize={13} fontWeight={800}>your goal: {goal} min a day</text>
    </svg>
  );
}

export function Spark({ values, min, max, unit, label }: { values: number[]; min?: number; max?: number; unit: string; label: string }) {
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
