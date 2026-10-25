import { useEffect, useState, useSyncExternalStore } from 'react';
import { Thinking, useCoachEntry } from '../coach/api';
import { PlanCard } from '../coach/CoachView';
import { MILESTONES } from '../content/curriculum';
import { greeting } from '../engine/greeting';
import { toolOf, type Genre, type Lesson, type Tool } from '../engine/lesson';
import { checkpointsOf, currentMilestone, visibleLessons, type SessionRole } from '../engine/planner';
import { dashboard, type Dashboard, type RunRow } from '../engine/progress';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { aiLessonsLoaded, lessonById, requestCoachLesson, useLessons } from './aiLessons';
import { LessonPlayer } from './LessonPlayer';
import { ShowoffCard } from './ShowoffCard';
import { currentSession, markDone, rebuildToday, resetAllLessons, startSession } from './state';

const ROLE: Record<SessionRole, string> = { warmup: 'Warm-up', review: 'Review', skill: 'New skill', groove: 'Groove' };
type Open = { lessonId: string; item?: number };

export function TodayView({ onCalibrate, openLessonId }: { onCalibrate: () => void; openLessonId?: string }) {
  const s = useSyncExternalStore(subscribeSettings, getSettings);
  const lessons = useLessons();
  const [open, setOpen] = useState<Open | undefined>(openLessonId ? { lessonId: openLessonId } : undefined);
  const [editing, setEditing] = useState(false);
  const [dash, setDash] = useState<Dashboard>();
  const [asks, setAsks] = useState(0); // each "new lesson" click is a new request
  const [swap, setSwap] = useState(0); // "Something else" steps through other lessons of this stage
  useEffect(() => { fetch('/api/runs').then(r => r.json()).then((runs: RunRow[]) => setDash(dashboard(runs))).catch(() => {}); }, [open]);

  const milestone = currentMilestone(MILESTONES, lessons, s.lessons, s.profile);
  const coachKey = `lesson-${new Date().toDateString()}-${milestone?.level}-${asks}`;
  const coach = useCoachEntry<Lesson>(coachKey);
  const coachOpen = lessons.filter(l => l.source === 'ai' && l.level === milestone?.level && !s.lessons[l.id]?.completedAt);
  // With "coach automatically" on, ask once a day for a lesson when there's none waiting for this milestone,
  // once you've played something (with no takes yet, the built-in first lessons are the right start).
  const played = !!dash?.totalRuns;
  useEffect(() => {
    if (s.liveCoach && s.profile.onboarded && played && milestone && aiLessonsLoaded() && !coachOpen.length) requestCoachLesson(coachKey);
  }, [s.liveCoach, s.profile.onboarded, played, milestone, coachOpen.length, coachKey, lessons]);

  if (!s.profile.onboarded || editing) return <Onboarding onCalibrate={onCalibrate} onDone={() => setEditing(false)} />;

  const session = currentSession();
  // A coach lesson can be deleted after today's session froze; skip it (kept in storage: AI lessons may still be loading).
  const playable = (i: number) => !!lessonById(session.items[i].lessonId);
  const firstUndone = session.items.findIndex((_, i) => playable(i) && !session.done.includes(i));
  const done = (id: string) => !!s.lessons[id]?.completedAt;
  const passed = MILESTONES.filter(m => { const c = checkpointsOf(m, lessons, s.profile); return c.length > 0 && c.every(l => done(l.id)); });
  const rank = passed.length ? passed[passed.length - 1].rank : 'New drummer';
  // One "next": today's first open item. The coach's lessons reach you through the session (the planner puts them first).
  const openItem = (i: number) => { startSession(); setOpen({ lessonId: session.items[i].lessonId, item: i }); };

  if (open) {
    const item = open.item !== undefined ? session.items[open.item] : undefined;
    const nextIdx = session.items.findIndex((_, i) => i !== open.item && playable(i) && !session.done.includes(i));
    return <LessonPlayer key={`${open.lessonId}/${open.item}`} lessonId={open.lessonId} role={item?.role} minutes={item?.minutes}
      onBack={() => setOpen(undefined)} onOpen={id => setOpen({ lessonId: id })}
      onItemDone={open.item === undefined ? undefined : () => markDone(open.item!)}
      onNext={open.item === undefined ? undefined : () => { markDone(open.item!); setOpen(nextIdx >= 0 ? { lessonId: session.items[nextIdx].lessonId, item: nextIdx } : undefined); }} />;
  }

  const visible = visibleLessons(lessons, s.profile);
  const path = MILESTONES.filter(m => checkpointsOf(m, lessons, s.profile).length); // stages for these goals (e.g. no Swing for rock only)
  const total = session.items.reduce((a, it, i) => a + (playable(i) ? it.minutes : 0), 0);
  // The trail: this stage's lessons in path order (the coach's after the built-ins), checkpoints as the challenges.
  const trail = milestone ? visible.filter(l => l.level === milestone.level && (l.source !== 'ai' || l.id in s.lessons || l === coachOpen[coachOpen.length - 1]))
    .sort((a, b) => Number(milestone.checkpoints.includes(a.id)) - Number(milestone.checkpoints.includes(b.id)) || Number(a.source === 'ai') - Number(b.source === 'ai')) : [];
  const fromSet = firstUndone >= 0 ? lessonById(session.items[firstUndone].lessonId) : undefined;
  // "Something else": another open lesson of this stage, a different kind of activity first.
  const others = trail.filter(l => !done(l.id) && l !== fromSet).sort((a, b) => Number(toolOf(a.steps[0]) === toolOf(fromSet?.steps[0] ?? a.steps[0])) - Number(toolOf(b.steps[0]) === toolOf(fromSet?.steps[0] ?? b.steps[0])));
  const hero = swap && others.length ? others[(swap - 1) % others.length] : fromSet;
  const heroItem = hero === fromSet ? firstUndone : -1;
  const jam = [...visible].reverse().find(l => l.level <= (milestone?.level ?? 99) && l.steps.some(st => st.jam));
  const go = () => (heroItem >= 0 ? openItem(heroItem) : hero ? setOpen({ lessonId: hero.id }) : jam && setOpen({ lessonId: jam.id }));
  const minutes = heroItem >= 0 ? session.items[heroItem].minutes : 5;
  const line = greeting({ hour: new Date().getHours(), streak: dash?.streak ?? 0, runs: dash?.totalRuns ?? 0, landedWeek: dash?.landedWeek ?? null, landedLastWeek: dash?.landedLastWeek ?? null,
    next: hero && { title: hero.title, tool: toolOf(hero.steps[0]), minutes, focus: hero.focus } });
  const trailDone = trail.filter(l => done(l.id)).length;
  return (
    <div className="today home">
      <div className="homeHero">
        <div className="avatar" aria-hidden>🥁</div>
        <div>
          <div className="bubble" aria-live="polite">
            <p>{line}</p>
            <div className="actions">
              <button className="primary big" autoFocus onClick={go}>{hero ? "Yes, let's go ▶" : 'Jam ▶'}</button>
              {others.length > 0 && <button onClick={() => setSwap(swap + 1)}>Something else</button>}
              {jam && hero && hero !== jam && <button onClick={() => setOpen({ lessonId: jam.id })}>Just jam</button>}
            </div>
          </div>
          {coach?.status === 'thinking' && <Thinking what="Your coach is writing your next lesson" />}
        </div>
        <div className="card youCard">
          {milestone && <div className="ring" style={{ '--p': `${trail.length ? (trailDone / trail.length) * 100 : 0}%` } as React.CSSProperties}>
            <div>Stage {path.indexOf(milestone) + 1}<br />{trailDone}/{trail.length}</div>
          </div>}
          <div>
            <div className="rankSticker small">{rank}</div>
            <ul className="youStats">
              <li>🔥 <b>{dash?.streak ?? 0}-day</b> streak</li>
              {dash?.landedWeek != null && <li>🎯 <b>{dash.landedWeek}%</b> notes landed this week{dash.landedLastWeek != null && dash.landedWeek > dash.landedLastWeek ? `, up from ${dash.landedLastWeek}%` : ''}</li>}
              <li>⏱ <b>{Math.round(dash?.minutesToday ?? 0)}</b> min today</li>
            </ul>
          </div>
        </div>
      </div>

      {session.items.length > 0 && <div className="card">
        <h3>Today's set · {total} min</h3>
        <div className="setTiles">
          {session.items.map((it, i) => {
            const l = lessonById(it.lessonId), isDone = session.done.includes(i);
            if (!l) return null;
            return (
              <button key={i} className={`setTile ${isDone ? 'done' : i === firstUndone ? 'cur' : ''}`} onClick={() => openItem(i)}>
                {i === firstUndone && <span className="tag">Up next</span>}
                <span className="ic" aria-hidden>{iconOf(l)}</span>
                <b>{isDone ? '✓ ' : ''}{l.title}</b>
                <span className="small">{TOOL_LABEL[toolOf(l.steps[0])]} · {it.minutes} min</span>
              </button>
            );
          })}
        </div>
      </div>}

      {passed.length > 0 && <ShowoffCard stage={passed[passed.length - 1]} profile={s.profile} />}

      {milestone && <div className="card">
        <h3>Stage {path.indexOf(milestone) + 1} · {milestone.title}</h3>
        <Trail lessons={trail} current={hero} done={done} isChallenge={l => milestone.checkpoints.includes(l.checkpoint ?? l.id)} onOpen={id => setOpen({ lessonId: id })} />
      </div>}

      <details className="planFold">
        <summary>Full path, coach lessons, weekly plan, settings</summary>
        {milestone && (
          <div className="card">
            <h3>Your coach</h3>
            {coach?.status === 'thinking' ? <Thinking what="Your coach is writing a lesson from your recent playing" />
              : <>
                {coach?.status === 'error' && <p className="warn">{coach.error}</p>}
                {coachOpen.length > 0
                  ? <p>Lessons written for you: {coachOpen.map(l => <button key={l.id} className="lessonChip next" onClick={() => setOpen({ lessonId: l.id })}>{l.title}</button>)}</p>
                  : <p className="small">The coach looks at your recent takes and writes the next lesson for this stage: a jam, an echo game, a challenge or a drill.</p>}
                <button onClick={() => { requestCoachLesson(coachKey.replace(/-\d+$/, `-${asks + 1}`)); setAsks(asks + 1); }}>Ask the coach for a new lesson</button>
              </>}
          </div>
        )}

        <div className="card">
          <h3>Weekly plan from your coach</h3>
          <PlanCard />
        </div>

        <div className="card">
          <h3>Your path</h3>
          {MILESTONES.map(m => {
            const checks = checkpointsOf(m, lessons, s.profile);
            if (!checks.length) return null;
            const passed = checks.every(l => s.lessons[l.id]?.completedAt);
            const extra = visible.filter(l => l.level === m.level && !m.checkpoints.includes(l.id));
            const chip = (l: Lesson, cls = '') => {
              const p = s.lessons[l.id];
              const state = p?.completedAt ? 'done' : p ? 'started' : '';
              return <button key={l.id} className={`lessonChip ${state} ${cls}`} onClick={() => setOpen({ lessonId: l.id })}
                title={p?.completedAt ? `Done · ${p.stars ?? 1} of 3 stars · best ${p.bestBpm} BPM` : p ? `Step ${p.step + 1} · ${p.bpm} BPM` : 'Not started'}>
                {l.title}{p?.completedAt && <span className="stars" aria-label={`${p.stars ?? 1} of 3 stars`}>{'★'.repeat(p.stars ?? 1)}{'☆'.repeat(3 - (p.stars ?? 1))}</span>}</button>;
            };
            return (
              <div key={m.level} className={`milestone ${passed ? 'passed' : m === milestone ? 'current' : 'later'}`}>
                <div>
                  <b>{passed ? '✓ ' : ''}{m.level + 1}. {m.title}</b>
                  {m === milestone && <ul className="canDo">{m.canDo.map(c => <li key={c}>{c}</li>)}</ul>}
                </div>
                <div className="chips">
                  <span className="small">Challenges:</span>{checks.map(l => chip(l, 'checkpoint'))}
                  {extra.length > 0 && <><span className="small">Lessons:</span>{extra.map(l => chip(l, l.source === 'ai' ? 'ai' : ''))}</>}
                </div>
              </div>
            );
          })}
          <p className="small">Pass a stage's challenges to move on. You can open any lesson; today's mix sticks to your current stage.</p>
        </div>

        <div className="actions">
          <button className="link" onClick={() => { if (!session.done.length || confirm('Plan today again from your current progress?')) rebuildToday(); }}>Rebuild today's mix</button>
          <button className="link" onClick={() => setEditing(true)}>Goals: {s.profile.goals.length ? s.profile.goals.join(', ') : 'all styles'} · {s.profile.minutesPerDay} min/day (change)</button>
          <button className="link danger" onClick={() => { if (confirm('Reset all lesson progress and redo the setup questions? Your run history in Trophies is kept.')) resetAllLessons(); }}>Reset all lesson progress</button>
        </div>
      </details>
    </div>
  );
}

const TOOL_LABEL: Record<Tool, string> = { jam: 'Play along', copy: 'I play, you copy', trade: 'Trade bars', free: 'Your own fill', challenge: 'Mini challenge', layers: 'One limb at a time', drill: 'Practice' };
const KIND_ICON: Record<string, string> = { groove: '🥁', rudiment: '🥢', fill: '💥', song: '🎵', exercise: '🎯' };
const TOOL_ICON: Record<Tool, string> = { jam: '🎸', copy: '🔁', trade: '🤜', free: '✨', challenge: '🔥', layers: '🧱', drill: '' };
const iconOf = (l: Lesson) => TOOL_ICON[toolOf(l.steps[0])] || KIND_ICON[l.kind] || '🎯';

/**
 * This stage as a winding trail of stops: done ones green, the next one big, the challenges as stars, a song at the end.
 * Kept to about ten stops: older finished lessons fold into one "done" stop, later ones into "+N more" (all are in Full path).
 */
function Trail({ lessons, current, done, isChallenge, onOpen }: { lessons: Lesson[]; current?: Lesson; done: (id: string) => boolean; isChallenge: (l: Lesson) => boolean; onOpen: (id: string) => void }) {
  const c = Math.max(0, current ? lessons.indexOf(current) : lessons.findIndex(l => !done(l.id)));
  const before = lessons.slice(0, c), after = lessons.slice(c + 1);
  const folded = before.length > 2 ? before.slice(0, -1) : [];
  const upcoming = after.filter(l => !isChallenge(l)), later = upcoming.slice(4);
  type Stop = { l?: Lesson; icon: string; name: string; cls: string };
  const stop = (l: Lesson): Stop => ({ l, name: l.title, icon: done(l.id) ? '✓' : isChallenge(l) ? '★' : iconOf(l),
    cls: l === current ? 'now' : done(l.id) ? 'done' : isChallenge(l) ? 'boss' : '' });
  const stops: Stop[] = [
    ...(folded.length ? [{ icon: '✓', name: `${folded.length} done`, cls: 'done' }] : []),
    ...before.slice(folded.length).map(stop), ...(lessons[c] ? [stop(lessons[c])] : []),
    ...after.filter(l => !later.includes(l) && !isChallenge(l)).map(stop),
    ...(later.length ? [{ icon: `+${later.length}`, name: 'more', cls: 'more' }] : []),
    ...after.filter(isChallenge).map(stop),
    { icon: '🎵', name: 'Unlock a real song', cls: 'song' },
  ];
  const pts = stops.map((_, i) => ({ x: 5 + (i * 90) / Math.max(1, stops.length - 1), y: 50 + 22 * Math.sin(i * 1.3) }));
  return (
    <div className="trail">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} /></svg>
      {stops.map((st, i) => {
        const style = { left: `${pts[i].x}%`, top: `${pts[i].y}%` }, cls = `stop ${st.cls} ${pts[i].y < 50 ? 'up' : ''}`;
        const inner = <><span className="dot" aria-hidden>{st.icon}</span><span className="name">{st.name}</span></>;
        return st.l
          ? <button key={st.l.id} className={cls} style={style} onClick={() => onOpen(st.l!.id)} title={st.l.title}
            aria-label={`${st.l.title}${done(st.l.id) ? ', done' : ''}${isChallenge(st.l) ? ', stage challenge' : ''}`}>{inner}</button>
          : <div key={st.name} className={cls} style={style}>{inner}</div>;
      })}
    </div>
  );
}

const GOALS: { id: Genre; label: string }[] = [{ id: 'rock', label: 'Rock / pop' }, { id: 'funk', label: 'Funk / R&B' }, { id: 'jazz', label: 'Jazz / swing' }];

function Onboarding({ onCalibrate, onDone }: { onCalibrate: () => void; onDone: () => void }) {
  const profile = getSettings().profile;
  const [goals, setGoals] = useState<Genre[]>(profile.goals);
  const [minutes, setMinutes] = useState(profile.minutesPerDay);
  const save = () => { setSettings({ profile: { goals, minutesPerDay: minutes, onboarded: true }, session: undefined }); onDone(); };
  return (
    <div className="today">
      <div className="card form onboarding">
        <h2>{profile.onboarded ? 'Your goals' : 'Welcome to Drum Coach'}</h2>
        {!profile.onboarded && <p>This app is your drum teacher. Each day it plans a short session from where you are: a warm-up, a review, one new skill and one groove. You build every groove one limb at a time while the app plays the rest, and it raises the tempo when you're ready.</p>}
        <fieldset>
          <legend>What do you want to play? Pick any, or none if you're not sure yet.</legend>
          {GOALS.map(g => (
            <label key={g.id} className="check"><input type="checkbox" checked={goals.includes(g.id)}
              onChange={e => setGoals(e.target.checked ? [...goals, g.id] : goals.filter(x => x !== g.id))} /> {g.label}</label>
          ))}
        </fieldset>
        <label>Minutes a day
          <select value={minutes} onChange={e => setMinutes(+e.target.value)}>
            {[15, 20, 25, 30, 45].map(m => <option key={m} value={m}>{m} minutes{m === 25 ? ' (recommended)' : ''}</option>)}
          </select>
        </label>
        {!profile.onboarded && <p className="small">Before your first lesson: check that every pad is recognised and measure the latency, under <button className="link" onClick={onCalibrate}>Setup → Pads</button> (the gear, top right). No kit? The keyboard works too (keys are shown under the highway).</p>}
        <div className="actions"><button className="primary big" onClick={save}>{profile.onboarded ? 'Save' : 'Let\'s start'}</button>
          {profile.onboarded && <button onClick={onDone}>Cancel</button>}</div>
      </div>
    </div>
  );
}
