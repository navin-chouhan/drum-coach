import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useCharts } from '../content/charts';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { requestPlay, requestSong } from '../ui/nav';
import { askCoach, Thinking, useCoachEntry } from './api';
import { say, voiceEngine } from '../voice/voice';
import { applyLevels } from '../play/audio';
import type { Genre } from '../engine/lesson';
import type { Plan } from './schemas';

type SavedPlan = { id: number; plan: Plan; checks: Record<string, boolean> };

const GOALS: { id: Genre; label: string }[] = [{ id: 'rock', label: 'Rock / pop' }, { id: 'funk', label: 'Funk' }, { id: 'jazz', label: 'Jazz' }, { id: 'latin', label: 'Latin' }];
/** One setting: a short title, one line under it, and its control (a switch, a choice or a slider). */
function Setting({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return <div className="tg"><b>{title}</b>{children}<span className="d">{sub}</span></div>;
}
const Switch = ({ on, set, label }: { on: boolean; set: (on: boolean) => void; label: string }) =>
  <button className={`sw ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)} />;
function Choice<T extends string | number>({ value, options, set, label }: { value: T; options: [T, string][]; set: (v: T) => void; label: string }) {
  return <span className="seg" role="group" aria-label={label}>{options.map(([v, l]) => <button key={String(v)} className={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => set(v)}>{l}</button>)}</span>;
}

/** Setup → Coach and voice: four groups of short switches (voice, while you play, sticks in hand, Claude and your plan). */
export function CoachSettings() {
  const [status, setStatus] = useState<{ ready: boolean; message: string }>();
  const settings = useSyncExternalStore(subscribeSettings, getSettings), profile = settings.profile;
  const [engine, setEngine] = useState<string>();
  useEffect(() => { void voiceEngine().then(setEngine); }, []);
  useEffect(() => {
    fetch('/api/coach/status').then(r => r.json()).then(setStatus)
      .catch(() => setStatus({ ready: false, message: 'Cannot reach the local server. Is `npm run dev` running?' }));
  }, []);
  // A new goal or daily length plans today's set again, as the onboarding questions do.
  const setProfile = (p: Partial<typeof profile>) => setSettings({ profile: { ...profile, ...p }, session: undefined });
  return (
    <div className="setup">
      <div className="groups">
        <div className="card">
          <h3>Voice</h3>
          <Setting title="Speak the verdicts" sub="After each take you hear what the screen says."><Switch label="Speak the verdicts" on={settings.voice} set={voice => setSettings({ voice })} /></Setting>
          <Setting title="Count me in out loud" sub={'"One, two, three, four" before each take.'}><Switch label="Count me in out loud" on={settings.countIn} set={countIn => setSettings({ countIn })} /></Setting>
          <Setting title="Coach voice volume" sub="Clear, but not louder than the kit.">
            <span className="slider"><input type="range" min={0.2} max={1.25} step={0.05} value={settings.voiceVolume} aria-label="Coach voice volume"
              onChange={e => { setSettings({ voiceVolume: Number(e.target.value) }); applyLevels(); }} />{Math.round(settings.voiceVolume * 100)}%</span></Setting>
          <Setting title="Talk back hands-free" sub="When the coach asks something, it listens without holding V."><Switch label="Talk back hands-free" on={settings.handsFree} set={handsFree => setSettings({ handsFree })} /></Setting>
          <p className="small">{engine === 'piper' ? 'Voice: Piper (offline, natural).' : engine === 'browser' ? "Voice: the browser's own (install Piper for a better one, see README)." : ''}
            {' '}<button onClick={() => void say('Ready when you are. One, two, three, four.', true)}>▶ Test the voice</button></p>
        </div>
        <div className="card">
          <h3>While you play</h3>
          <Setting title="Live tips" sub="One short tip during a take when something repeats.">
            <Choice label="Live tips" value={settings.liveTips} set={liveTips => setSettings({ liveTips })} options={[['off', 'Off'], ['screen', 'Screen'], ['voice', '+ spoken']]} /></Setting>
          <Setting title="How much the coach says" sub="Short is easier to take in from the throne.">
            <Choice label="How much the coach says" value={settings.chattiness} set={chattiness => setSettings({ chattiness })} options={[['quiet', 'Short'], ['normal', 'Normal'], ['talkative', 'More']]} /></Setting>
          <Setting title="Autopilot" sub="After a take, the next move starts by itself in 5 s. Any pad hit waits."><Switch label="Autopilot" on={!!settings.autopilot} set={autopilot => setSettings({ autopilot })} /></Setting>
        </div>
        <div className="card">
          <h3>Sticks in hand</h3>
          <Setting title="Pad commands" sub="Answer the screen from the kit, between takes."><Switch label="Pad commands" on={settings.padCommands} set={padCommands => setSettings({ padCommands })} /></Setting>
          <div className="gest">
            <i>hi-hat pedal × 3</i><span>yes / the big blue move (or crash × 2, or say "yes")</span>
            <i>ride × 2</i><span>next / something else</span>
            <i>tom 2 × 2</i><span>listen</span>
            <i>floor × 2</i><span>slower</span>
            <i>tom 1 × 2</i><span>faster</span>
            <i>crash × 4</i><span>stop, during a take</span>
          </div>
        </div>
        <div className="card">
          <h3>Claude and your plan</h3>
          <p className={status?.ready ? 'claudeOk' : 'warn'}>{status ? `${status.ready ? '✓ ' : ''}${status.message}` : 'Checking…'}</p>
          <Setting title="The coach follows my practice" sub="Greets each lesson, reacts to takes, suggests the next step. One Claude call each."><Switch label="The coach follows my practice" on={settings.liveCoach} set={liveCoach => setSettings({ liveCoach })} /></Setting>
          <Setting title="The coach writes the tips" sub="Once per exercise, then saved."><Switch label="The coach writes the tips" on={settings.aiTips} set={aiTips => setSettings({ aiTips })} /></Setting>
          <Setting title="Goals" sub="What the coach plans towards. None picked: a bit of everything.">
            <span className="seg" role="group" aria-label="Goals">{GOALS.map(g => { const on = profile.goals.includes(g.id); return <button key={g.id} className={on ? 'on' : ''} aria-pressed={on}
              onClick={() => setProfile({ goals: on ? profile.goals.filter(x => x !== g.id) : [...profile.goals, g.id] })}>{g.label}</button>; })}</span></Setting>
          <Setting title="Minutes a day" sub="Your daily set and the goal line in Progress.">
            <Choice label="Minutes a day" value={profile.minutesPerDay} set={minutesPerDay => setProfile({ minutesPerDay })} options={[15, 20, 25, 30, 45].map(m => [m, String(m)] as [number, string])} /></Setting>
        </div>
      </div>
    </div>
  );
}

export function PlanCard() {
  const [saved, setSaved] = useState<SavedPlan | null>(null);
  const [form, setForm] = useState({ goals: 'Steady time on rock grooves and cleaner fills', minutesPerDay: 20, daysPerWeek: 5 });
  const [n, setN] = useState(0);
  const key = `plan:${n}`;
  const e = useCoachEntry<SavedPlan>(n ? key : null);
  const charts = useCharts();
  useEffect(() => { fetch('/api/plan').then(r => r.json()).then(setSaved).catch(() => {}); }, []);
  const fresh = e?.status === 'done' ? e.data : undefined;
  const shown = fresh && (!saved || fresh.id > saved.id) ? fresh : saved;

  const toggle = (k: string) => {
    if (!shown) return;
    const checks = { ...shown.checks, [k]: !shown.checks[k] };
    setSaved({ ...shown, checks });
    void fetch(`/api/plan/${shown.id}/checks`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(checks) });
  };

  return (
    <div className="card">
      <h3>Weekly plan</h3>
      <div className="form">
        <label>Goals <input value={form.goals} maxLength={500} onChange={ev => setForm({ ...form, goals: ev.target.value })} /></label>
        <div className="row2">
          <label>Minutes/day <input type="number" min={5} max={180} value={form.minutesPerDay} onChange={ev => setForm({ ...form, minutesPerDay: +ev.target.value || 20 })} /></label>
          <label>Days/week <input type="number" min={1} max={7} value={form.daysPerWeek} onChange={ev => setForm({ ...form, daysPerWeek: Math.min(7, Math.max(1, +ev.target.value || 5)) })} /></label>
        </div>
        {e?.status === 'thinking' ? <Thinking what="The coach is writing your plan" />
          : <button className="primary" onClick={() => { setN(n + 1); askCoach(`plan:${n + 1}`, 'plan', form); }}>{shown ? 'Make a new plan' : 'Make my plan'}</button>}
        {e?.status === 'error' && <p className="warn">{e.error}</p>}
      </div>
      {shown && (
        <div className="plan">
          <h4>{shown.plan.title}</h4>
          {shown.plan.focus && <p>🎯 <b>{shown.plan.focus}</b>{shown.plan.why ? ` · ${shown.plan.why}` : ''}</p>}
          {shown.plan.days?.map((d, di) => (
            <div key={di}>
              <b>{d.day}</b>
              <ul>
                {d.items.map((it, ii) => {
                  const k = `${di}.${ii}`;
                  return (
                    <li key={k}>
                      <label className="check"><input type="checkbox" checked={!!shown.checks[k]} onChange={() => toggle(k)} />
                        <span className={shown.checks[k] ? 'done' : ''}>{it.title} · {it.minutes} min{it.bpm ? ` · ${it.bpm} BPM` : ''}</span></label>
                      {it.notes && <div className="small">{it.notes}</div>}
                      {it.chartId?.startsWith('yt-') ? <button className="link" onClick={() => requestSong(it.chartId!)}>play</button>
                        : it.chartId && charts.some(c => c.id === it.chartId) && <button className="link" onClick={() => requestPlay({ chartId: it.chartId!, bpm: it.bpm })}>play</button>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
