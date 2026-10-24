import { useEffect, useState, useSyncExternalStore } from 'react';
import { saveChart, useCharts } from '../content/charts';
import type { Chart } from '../engine/chart';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { requestPlay } from '../ui/nav';
import { askCoach, Thinking, useCoachEntry } from './api';
import { say, voiceEngine } from '../voice/voice';
import type { ChatReply, NextExercise, Plan } from './schemas';

type Msg = { role: 'user' | 'assistant'; content: string; chart?: Chart };
type SavedPlan = { id: number; plan: Plan; checks: Record<string, boolean> };
const CHAT_KEY = 'drumcoach.chat';

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
        <label className="check"><input type="checkbox" checked={settings.handsFree} onChange={e => setSettings({ handsFree: e.target.checked })} /> Hands-free: when the coach asks me something, listen for my answer (no need to hold V)</label>
      </div>
    </div>
  );
}

export function NextCard() {
  const [n, setN] = useState(0);
  const key = `next:${n}`;
  const e = useCoachEntry<NextExercise>(key);
  const charts = useCharts();
  const title = (id: string) => charts.find(c => c.id === id)?.title ?? id;
  return (
    <div className="card">
      <h3>What next?</h3>
      {e?.status === 'thinking' ? <Thinking /> : <button className="primary" onClick={() => { setN(n + 1); askCoach(`next:${n + 1}`, 'next'); }}>Pick my next exercise</button>}
      {e?.status === 'error' && <p className="warn">{e.error}</p>}
      {e?.status === 'done' && e.data && (
        <div className="drill">
          <b>{title(e.data.chartId)}</b> at {e.data.bpm} BPM
          <p>{e.data.reason}</p>
          {e.note && <p className="small">{e.note}</p>}
          <button onClick={() => requestPlay({ chartId: e.data!.chartId, bpm: e.data!.bpm })}>Play it</button>
        </div>
      )}
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
                      {it.chartId && charts.some(c => c.id === it.chartId) && <button className="link" onClick={() => requestPlay({ chartId: it.chartId!, bpm: it.bpm })}>play</button>}
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

export function ChatCard() {
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem(CHAT_KEY) ?? '[]'); } catch { return []; } });
  const [text, setText] = useState('');
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const e = useCoachEntry<ChatReply>(pendingKey);
  const save = (m: Msg[]) => { setMsgs(m); try { localStorage.setItem(CHAT_KEY, JSON.stringify(m.slice(-30))); } catch { /* ignore */ } };

  const send = () => {
    const content = text.trim();
    if (!content || (pendingKey && e?.status === 'thinking')) return;
    const next = [...msgs, { role: 'user' as const, content }];
    save(next); setText('');
    const body = { messages: next.slice(-20).map(m => ({ role: m.role, content: m.content.slice(0, 4000) })) };
    const key = `chat:${JSON.stringify(body)}`;
    setPendingKey(key);
    askCoach<ChatReply>(key, 'chat', body, r => {
      save([...next, { role: 'assistant', content: r.reply, chart: r.chart }]);
      setPendingKey(null);
    });
  };

  return (
    <div className="card chat">
      <h3>Ask the coach <button className="link right" onClick={() => save([])}>clear</button></h3>
      <div className="msgs" aria-live="polite">
        {msgs.length === 0 && <p className="small">Ask about technique, or ask for an exercise ("give me a 2-bar hi-hat/kick coordination drill").</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content}
            {m.chart && <div><button onClick={async () => { const c = await saveChart(m.chart!, 'ai'); requestPlay({ chartId: c.id }); }}>Save &amp; play "{m.chart.title}"</button></div>}
          </div>
        ))}
        {e?.status === 'thinking' && <Thinking />}
        {e?.status === 'error' && <p className="warn">{e.error} <button className="link" onClick={() => { setPendingKey(null); }}>dismiss</button></p>}
      </div>
      <form onSubmit={ev => { ev.preventDefault(); send(); }} className="chatInput">
        <input value={text} onChange={ev => setText(ev.target.value)} placeholder="Type a question…" maxLength={4000} aria-label="Message to the coach" />
        <button className="primary" disabled={!!pendingKey && e?.status === 'thinking'}>Send</button>
      </form>
    </div>
  );
}
