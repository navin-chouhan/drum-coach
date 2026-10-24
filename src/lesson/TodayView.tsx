import { useEffect, useState, useSyncExternalStore } from 'react';
import { Thinking, useCoachEntry } from '../coach/api';
import { ChatCard, NextCard, PlanCard } from '../coach/CoachView';
import { MILESTONES } from '../content/curriculum';
import type { Genre, Lesson } from '../engine/lesson';
import { checkpointsOf, currentMilestone, visibleLessons, type SessionRole } from '../engine/planner';
import { dashboard, type RunRow } from '../engine/progress';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { lessonById, requestCoachLesson, useLessons } from './aiLessons';
import { LessonPlayer } from './LessonPlayer';
import { currentSession, markDone, rebuildToday, resetAllLessons, startSession } from './state';

const ROLE: Record<SessionRole, string> = { warmup: 'Warm-up', review: 'Review', skill: 'New skill', groove: 'Groove' };
type Open = { lessonId: string; item?: number };

export function TodayView({ onCalibrate }: { onCalibrate: () => void }) {
  const s = useSyncExternalStore(subscribeSettings, getSettings);
  const lessons = useLessons();
  const [open, setOpen] = useState<Open>();
  const [editing, setEditing] = useState(false);
  const [streak, setStreak] = useState<number>();
  const [asks, setAsks] = useState(0); // each "new lesson" click is a new request
  useEffect(() => { fetch('/api/runs').then(r => r.json()).then((runs: RunRow[]) => setStreak(dashboard(runs).streak)).catch(() => {}); }, [open]);

  const milestone = currentMilestone(MILESTONES, lessons, s.lessons, s.profile);
  const coachKey = `lesson-${new Date().toDateString()}-${milestone?.level}-${asks}`;
  const coach = useCoachEntry<Lesson>(coachKey);
  const coachOpen = lessons.filter(l => l.source === 'ai' && l.level === milestone?.level && !s.lessons[l.id]?.completedAt);
  // With "coach automatically" on, ask once a day for a lesson when there's none waiting for this milestone.
  useEffect(() => {
    if (s.liveCoach && s.profile.onboarded && milestone && !coachOpen.length) requestCoachLesson(coachKey);
  }, [s.liveCoach, s.profile.onboarded, milestone, coachOpen.length, coachKey]);

  if (!s.profile.onboarded || editing) return <Onboarding onCalibrate={onCalibrate} onDone={() => setEditing(false)} />;

  const session = currentSession();
  const firstUndone = session.items.findIndex((_, i) => !session.done.includes(i));
  const done = (id: string) => !!s.lessons[id]?.completedAt;
  const passed = MILESTONES.filter(m => { const c = checkpointsOf(m, lessons, s.profile); return c.length > 0 && c.every(l => done(l.id)); });
  const rank = passed.length ? passed[passed.length - 1].rank : 'New drummer';
  // Next up: the coach's lesson for you if one is waiting, otherwise today's session.
  const openItem = (i: number) => { startSession(); setOpen({ lessonId: session.items[i].lessonId, item: i }); };

  if (open) {
    const item = open.item !== undefined ? session.items[open.item] : undefined;
    const nextIdx = session.items.findIndex((_, i) => i !== open.item && !session.done.includes(i));
    return <LessonPlayer key={`${open.lessonId}/${open.item}`} lessonId={open.lessonId} role={item?.role} minutes={item?.minutes}
      onBack={() => setOpen(undefined)}
      onItemDone={open.item === undefined ? undefined : () => markDone(open.item!)}
      onNext={open.item === undefined ? undefined : () => { markDone(open.item!); setOpen(nextIdx >= 0 ? { lessonId: session.items[nextIdx].lessonId, item: nextIdx } : undefined); }} />;
  }

  const visible = visibleLessons(lessons, s.profile);
  const total = session.items.reduce((a, i) => a + i.minutes, 0);
  return (
    <div className="today">
      <div className="card todayHead">
        <div>
          <p className="small">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}{streak ? ` · ${streak}-day streak 🔥` : ''}</p>
          <div className="rankSticker small">{rank}</div>
          {milestone && <p>Stage {milestone.level + 1} of {MILESTONES.length}: <b>{milestone.title}</b>, on the way to <b>{milestone.rank}</b></p>}
        </div>
        <div className="nextUp">
          {coachOpen.length > 0 ? <>
            <p className="small">Next up, picked by your coach</p>
            <button className="primary big" autoFocus onClick={() => setOpen({ lessonId: coachOpen[0].id })}>{coachOpen[0].title} →</button>
            {coachOpen[0].focus && <p className="small">{coachOpen[0].focus}</p>}
          </> : firstUndone >= 0 ? <>
            <p className="small">Next up: {ROLE[session.items[firstUndone].role].toLowerCase()} · {total} min today</p>
            <button className="primary big" autoFocus onClick={() => openItem(firstUndone)}>{lessonById(session.items[firstUndone].lessonId)?.title ?? 'Start'} →</button>
          </> : <p className="doneMsg">Session done. Nice work! Play anything from your path, or try Practice.</p>}
          {coach?.status === 'thinking' && <Thinking what="Your coach is writing your next lesson" />}
        </div>
      </div>

      <div className="card">
        <h3>Today's session</h3>
        {session.items.length === 0 && <p className="small">You've finished the whole path. Reviews will keep coming back; ask the coach for new exercises below.</p>}
        <ol className="session">
          {session.items.map((it, i) => {
            const l = lessonById(it.lessonId), done = session.done.includes(i);
            if (!l) return null;
            return (
              <li key={i} className={done ? 'done' : i === firstUndone ? 'on' : ''}>
                <span className="role">{ROLE[it.role]}</span>
                <span className="title">{l.title}{l.source === 'ai' && <span className="badge">by your coach</span>}</span>
                <span className="small">{it.minutes} min</span>
                <button onClick={() => openItem(i)}>{done ? 'Again' : 'Open'}</button>
              </li>
            );
          })}
        </ol>
        <div className="actions">
          <button className="link" onClick={() => { if (!session.done.length || confirm('Plan today again from your current progress?')) rebuildToday(); }}>Rebuild today's plan</button>
          <button className="link" onClick={() => setEditing(true)}>Goals: {s.profile.goals.length ? s.profile.goals.join(', ') : 'all styles'} · {s.profile.minutesPerDay} min/day (change)</button>
        </div>
      </div>

      {milestone && (
        <div className="card">
          <h3>Your coach</h3>
          {coach?.status === 'thinking' ? <Thinking what="Your coach is writing a lesson from your recent playing" />
            : <>
              {coach?.status === 'error' && <p className="warn">{coach.error}</p>}
              {coachOpen.length > 0
                ? <p>Lessons written for you: {coachOpen.map(l => <button key={l.id} className="lessonChip next" onClick={() => setOpen({ lessonId: l.id })}>{l.title}</button>)}</p>
                : <p className="small">The coach looks at your recent takes and writes the next lesson for this milestone. Without it, the built-in lessons below are used.</p>}
              <button onClick={() => { requestCoachLesson(coachKey.replace(/-\d+$/, `-${asks + 1}`)); setAsks(asks + 1); }}>Ask the coach for a new lesson</button>
            </>}
        </div>
      )}

      <div className="grid2">
        <div className="stack"><NextCard /><PlanCard /></div>
        <ChatCard />
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
                <span className="small">Checkpoints:</span>{checks.map(l => chip(l, 'checkpoint'))}
                {extra.length > 0 && <><span className="small">Lessons:</span>{extra.map(l => chip(l, l.source === 'ai' ? 'ai' : ''))}</>}
              </div>
            </div>
          );
        })}
        <p className="small">Pass a milestone's checkpoints to move on. You can open any lesson; the session planner sticks to your current milestone.</p>
      </div>

      <div className="actions">
        <button className="link danger" onClick={() => { if (confirm('Reset all lesson progress and redo the setup questions? Your run history in Trophies is kept.')) resetAllLessons(); }}>Reset all lesson progress</button>
      </div>
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
