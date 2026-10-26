import { useEffect, useState, useSyncExternalStore } from 'react';
import { LESSON_BY_ID, MILESTONES } from '../content/curriculum';
import { rankState } from '../engine/planner';
import type { StudentProfile } from '../engine/profile';
import { getSettings, subscribeSettings } from '../input/settings';
import { useLessons } from '../lesson/aiLessons';

// A human in the loop (N2): a one-page summary to print or show a teacher, and the teacher's notes typed back in, which
// the coach reads for lessons, plans and the live chat.
export type TeacherNote = { date: string; text: string };
const NOTES_KEY = 'teacherNotes';

export async function loadTeacherNotes(): Promise<TeacherNote[]> {
  try { const all = await (await fetch('/api/settings')).json(); return Array.isArray(all[NOTES_KEY]) ? all[NOTES_KEY] : []; } catch { return []; }
}
const saveTeacherNotes = (notes: TeacherNote[]) =>
  fetch(`/api/settings/${NOTES_KEY}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(notes.slice(-20)) });

export function TeacherView({ onBack }: { onBack: () => void }) {
  const s = useSyncExternalStore(subscribeSettings, getSettings), lessons = useLessons();
  const [profile, setProfile] = useState<StudentProfile>(), [notes, setNotes] = useState<TeacherNote[]>([]), [draft, setDraft] = useState('');
  useEffect(() => { void fetch('/api/profile').then(r => r.json()).then(setProfile).catch(() => {}); void loadTeacherNotes().then(setNotes); }, []);
  const ranks = MILESTONES.map(m => ({ m, r: rankState(m, lessons, s.lessons, s.profile) })).filter(x => x.r.total);
  const done = Object.entries(s.lessons).filter(([, p]) => p.completedAt).map(([id, p]) => ({ title: LESSON_BY_ID[id]?.title ?? lessons.find(l => l.id === id)?.title ?? id, stars: p.stars ?? 1, bpm: p.bestBpm, at: p.completedAt! }))
    .sort((a, b) => b.at.localeCompare(a.at));
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    const next = [...notes, { date: new Date().toISOString().slice(0, 10), text: text.slice(0, 1000) }];
    setNotes(next); setDraft(''); void saveTeacherNotes(next);
  };

  return (
    <div className="today teacherView">
      <div className="card noPrint">
        <button className="link back" onClick={onBack}>← Trophies</button>
        <h2>👩‍🏫 For your teacher</h2>
        <p>A one-page summary to print or show a drum teacher, now and then (monthly is great). With it, bring a 30-second clip
          from "📷 Check yourself" (Save clip) and a take's MIDI file (Save take as MIDI, under a lesson's result). Type what the
          teacher says below: your coach reads it.</p>
        <div className="actions"><button className="primary" onClick={() => window.print()}>🖨 Print this page</button></div>
      </div>
      <div className="card teacherSheet">
        <h3>Drum Coach progress · {new Date().toLocaleDateString()}</h3>
        <p><b>Goals:</b> {s.profile.goals.length ? s.profile.goals.join(', ') : 'not sure yet'} · {s.profile.minutesPerDay} min a day{s.leftHanded ? ' · left-handed' : ''}</p>
        <p><b>Ranks:</b> {ranks.filter(x => x.r.state !== 'locked').map(({ m, r }) => `${m.rank}${r.state === 'proven' ? ' (proven)' : ''}`).join(', ') || 'none yet'}
          {(n => n && <> · <b>working on:</b> stage {n.m.level + 1}, {n.m.title}</>)(ranks.find(x => x.r.state === 'locked'))}</p>
        {profile && <>
          <p><b>Last 28 days:</b> {profile.days} days, {profile.minutes} minutes{profile.timing ? `, on average ${Math.abs(Math.round(profile.timing.offset))} ms ${profile.timing.offset >= 0 ? 'late' : 'early'}${profile.timing.trend ? ` (${profile.timing.trend})` : ''}` : ''}.</p>
          <table className="notemap"><tbody>
            {Object.entries(profile.perDrum).map(([d, v]) => <tr key={d}><td>{d}</td><td>{v.accuracy}% landed</td><td>{v.offset >= 0 ? '+' : ''}{v.offset} ms</td><td>{v.trend ?? ''}</td></tr>)}
          </tbody></table>
          {profile.topTips.length > 0 && <p><b>What the app keeps saying:</b> {profile.topTips.map(t => `${t.words} (${t.count}×)`).join(', ')}</p>}
        </>}
        <p><b>Lessons finished ({done.length}):</b> {done.slice(0, 20).map(l => `${l.title} ${'★'.repeat(l.stars)}${l.bpm ? ` ${l.bpm} BPM` : ''}`).join(' · ') || 'none yet'}</p>
        <p className="small">Questions for the teacher: is my grip and stroke relaxed? Anything in my posture or feet? What should I practise next?</p>
      </div>
      <div className="card noPrint">
        <h3>The teacher's notes</h3>
        <textarea rows={4} value={draft} onChange={e => setDraft(e.target.value)} placeholder="e.g. Left wrist is stiff: practise slow singles with the left hand only. Heel too high on the kick." style={{ width: '100%', font: 'inherit' }} />
        <div className="actions"><button className="primary" onClick={add} disabled={!draft.trim()}>Save note</button></div>
        {notes.length ? <ul>{[...notes].reverse().map((n, i) => <li key={i}><b>{n.date}</b>: {n.text}</li>)}</ul> : <p className="small">No notes yet.</p>}
      </div>
    </div>
  );
}
