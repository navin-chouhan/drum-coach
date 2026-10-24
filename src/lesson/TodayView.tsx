import { useEffect, useState, useSyncExternalStore } from 'react';
import { CURRICULUM, LESSON_BY_ID } from '../content/curriculum';
import type { Genre } from '../engine/lesson';
import { nextLesson, visibleLessons, type SessionRole } from '../engine/planner';
import { dashboard, type RunRow } from '../engine/progress';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { LessonPlayer } from './LessonPlayer';
import { currentSession, markDone, rebuildToday, resetAllLessons, startSession } from './state';

const ROLE: Record<SessionRole, string> = { warmup: 'Warm-up', review: 'Review', skill: 'New skill', groove: 'Groove' };
const LEVELS = ['Setup & counting', 'One limb at a time', 'The money beat', 'Variations & fills', '16ths & dynamics', 'Triplets & feels', 'Jazz'];
type Open = { lessonId: string; item?: number };

export function TodayView({ onCalibrate }: { onCalibrate: () => void }) {
  const s = useSyncExternalStore(subscribeSettings, getSettings);
  const [open, setOpen] = useState<Open>();
  const [editing, setEditing] = useState(false);
  const [streak, setStreak] = useState<number>();
  useEffect(() => { fetch('/api/runs').then(r => r.json()).then((runs: RunRow[]) => setStreak(dashboard(runs).streak)).catch(() => {}); }, [open]);

  if (!s.profile.onboarded || editing) return <Onboarding onCalibrate={onCalibrate} onDone={() => setEditing(false)} />;

  const session = currentSession();
  const firstUndone = session.items.findIndex((_, i) => !session.done.includes(i));
  const openItem = (i: number) => { startSession(); setOpen({ lessonId: session.items[i].lessonId, item: i }); };

  if (open) {
    const item = open.item !== undefined ? session.items[open.item] : undefined;
    const nextIdx = session.items.findIndex((_, i) => i !== open.item && !session.done.includes(i));
    return <LessonPlayer key={`${open.lessonId}/${open.item}`} lessonId={open.lessonId} role={item?.role} minutes={item?.minutes}
      onBack={() => setOpen(undefined)}
      onNext={open.item === undefined ? undefined : () => { markDone(open.item!); setOpen(nextIdx >= 0 ? { lessonId: session.items[nextIdx].lessonId, item: nextIdx } : undefined); }} />;
  }

  const visible = visibleLessons(CURRICULUM, s.profile), next = nextLesson(CURRICULUM, s.lessons, s.profile);
  const total = session.items.reduce((a, i) => a + i.minutes, 0);
  return (
    <div className="today">
      <div className="card todayHead">
        <div>
          <h2>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <p className="small">{streak ? `${streak}-day streak · ` : ''}{total} minutes planned{next ? ` · up next on your path: ${next.title}` : ''}</p>
        </div>
        {firstUndone >= 0
          ? <button className="primary big" autoFocus onClick={() => openItem(firstUndone)}>{session.done.length ? 'Continue' : 'Start today\'s session'}</button>
          : <p className="doneMsg">Session done. Nice work! Play anything from your path, or try Free play.</p>}
      </div>

      <div className="card">
        <h3>Today's session</h3>
        {session.items.length === 0 && <p className="small">You've finished the whole path. Reviews will keep coming back; the Coach tab can make new exercises.</p>}
        <ol className="session">
          {session.items.map((it, i) => {
            const l = LESSON_BY_ID[it.lessonId], done = session.done.includes(i);
            return (
              <li key={i} className={done ? 'done' : i === firstUndone ? 'on' : ''}>
                <span className="role">{ROLE[it.role]}</span>
                <span className="title">{l.title} <span className="small">· level {l.level}</span></span>
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

      <div className="card">
        <h3>Your path</h3>
        {LEVELS.map((name, level) => {
          const ls = visible.filter(l => l.level === level);
          return ls.length ? (
            <div key={level} className="pathLevel">
              <span className="small">L{level} · {name}</span>
              <div className="chips">
                {ls.map(l => {
                  const p = s.lessons[l.id];
                  const state = p?.completedAt ? 'done' : l === next ? 'next' : p ? 'started' : '';
                  return <button key={l.id} className={`lessonChip ${state}`} onClick={() => setOpen({ lessonId: l.id })}
                    title={p?.completedAt ? `Done · best ${p.bestBpm} BPM` : p ? `Step ${p.step + 1} · ${p.bpm} BPM` : 'Not started'}>
                    {p?.completedAt ? '✓ ' : ''}{l.title}</button>;
                })}
              </div>
            </div>
          ) : null;
        })}
        <p className="small">Lessons are ordered; skipping ahead is fine, the session planner still picks the first unfinished one.</p>
      </div>

      <div className="actions">
        <button className="link danger" onClick={() => { if (confirm('Reset all lesson progress and redo the setup questions? Your run history in Progress is kept.')) resetAllLessons(); }}>Reset all lesson progress</button>
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
        {!profile.onboarded && <p className="small">Before your first lesson: check that every pad is recognised and measure the latency, on the <button className="link" onClick={onCalibrate}>Calibrate tab</button>. No kit? The keyboard works too (keys are shown under the highway).</p>}
        <div className="actions"><button className="primary big" onClick={save}>{profile.onboarded ? 'Save' : 'Let\'s start'}</button>
          {profile.onboarded && <button onClick={onDone}>Cancel</button>}</div>
      </div>
    </div>
  );
}
