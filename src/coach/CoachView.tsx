import { useEffect, useState, useSyncExternalStore } from 'react';
import { useCharts } from '../content/charts';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { requestPlay, requestSong } from '../ui/nav';
import { askCoach, Thinking, useCoachEntry } from './api';
import { say, voiceEngine } from '../voice/voice';
import type { Plan } from './schemas';

type SavedPlan = { id: number; plan: Plan; checks: Record<string, boolean> };

/** The coach's settings (shown under Setup → Coach and voice). */
export function CoachSettings() {
  const [status, setStatus] = useState<{ ready: boolean; message: string }>();
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const [engine, setEngine] = useState<string>();
  useEffect(() => { void voiceEngine().then(setEngine); }, []);
  useEffect(() => {
    fetch('/api/coach/status').then(r => r.json()).then(setStatus)
      .catch(() => setStatus({ ready: false, message: 'Cannot reach the local server. Is `npm run dev` running?' }));
  }, []);
  return (
    <div className="coachView">
      <div className={`card ${status && !status.ready ? 'warnCard' : ''}`}>
        <h3>AI coach</h3>
        <p className="small">{status?.message ?? 'Checking…'}</p>
        <div className="row2">
          <label className="inline">Tips while you play
            <select value={settings.liveTips} onChange={e => setSettings({ liveTips: e.target.value as typeof settings.liveTips })}>
              <option value="off">off</option><option value="screen">on screen</option><option value="voice">on screen + spoken</option>
            </select></label>
          <label className="inline">How chatty
            <select value={settings.chattiness} onChange={e => setSettings({ chattiness: e.target.value as typeof settings.chattiness })}>
              <option value="quiet">quiet: only big problems</option><option value="normal">normal</option><option value="talkative">talkative: dynamics and more praise</option>
            </select></label>
        </div>
        <label className="check"><input type="checkbox" checked={settings.voice} onChange={e => setSettings({ voice: e.target.checked })} /> Speak verdicts and the coach's feedback</label>
        <p className="small">Voice: {engine === 'piper' ? 'Piper (offline, natural)' : engine === 'browser' ? "the browser's voice (install Piper for a better one, see README)" : '…'}
          {' '}<button className="link" onClick={() => void say('Ready when you are. One, two, three, four.', true)}>test the voice</button></p>
        <label className="check"><input type="checkbox" checked={settings.countIn} onChange={e => setSettings({ countIn: e.target.checked })} /> Count me in out loud ("one, two, three, four")</label>
        <label className="check"><input type="checkbox" checked={settings.aiTips} onChange={e => setSettings({ aiTips: e.target.checked })} /> The coach writes the tips for each exercise (one Claude call per exercise, then cached)</label>
        <label className="check"><input type="checkbox" checked={settings.liveCoach} onChange={e => setSettings({ liveCoach: e.target.checked })} /> The coach follows my practice: greets each exercise, reacts to every take, suggests the next step (Claude, one call each)</label>
        <label className="check"><input type="checkbox" checked={!!settings.autopilot} onChange={e => setSettings({ autopilot: e.target.checked })} /> Autopilot: after each take the next move starts by itself in 5 seconds (hit any pad to wait)</label>
        <label className="check"><input type="checkbox" checked={settings.handsFree} onChange={e => setSettings({ handsFree: e.target.checked })} /> Hands-free: when the coach asks me something, listen for my answer (no need to hold V)</label>
        <label className="check"><input type="checkbox" checked={settings.padCommands} onChange={e => setSettings({ padCommands: e.target.checked })} /> Pad commands, sticks in hand: between takes press the hi-hat pedal three times quickly (or hit the crash twice) = yes / the big move; hit twice quickly on the snare = again, floor tom = slower, tom 1 = faster, tom 2 = listen, ride = next; four quick crashes during a take = stop</label>
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
          {shown.plan.days.map((d, di) => (
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
