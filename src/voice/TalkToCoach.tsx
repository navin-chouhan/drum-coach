import { useEffect, useRef, useState } from 'react';
import { askCoach } from '../coach/api';
import type { ChatReply } from '../coach/schemas';
import { summarizeRun } from '../coach/summary';
import { player } from '../play/player';
import { say } from './voice';
import { saveChart } from '../content/charts';
import { requestPlay } from '../ui/nav';
import { toWav16k } from './wav';

const CHAT_KEY = 'drumcoach.chat'; // shared with the Coach tab's chat
type Msg = { role: 'user' | 'assistant'; content: string };
type State = { phase: 'idle' | 'listening' | 'hearing' | 'thinking' | 'answer' | 'error'; q?: string; a?: string; chart?: ChatReply['chart']; error?: string };

/**
 * Hold V (or the mic button) and talk; release to ask. Speech is transcribed on this laptop (Whisper), the coach
 * answers with what you're doing right now as context, and the answer is spoken.
 */
export function TalkToCoach() {
  const [s, setS] = useState<State>({ phase: 'idle' });
  const rec = useRef<{ mr: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);
  const hide = useRef(0);

  async function begin() {
    if (rec.current) return;
    clearTimeout(hide.current);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mr = new MediaRecorder(stream), chunks: Blob[] = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.start();
      rec.current = { mr, chunks, stream };
      setS({ phase: 'listening' });
    } catch { setS({ phase: 'error', error: 'Microphone blocked: allow it via the icon left of the address bar.' }); }
  }

  async function end() {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    await new Promise(res => { r.mr.onstop = res; r.mr.stop(); });
    r.stream.getTracks().forEach(t => t.stop()); // mic off as soon as you let go
    setS({ phase: 'hearing' });
    try {
      const wav = await toWav16k(new Blob(r.chunks, { type: r.mr.mimeType }));
      const res = await fetch('/api/stt', { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: wav });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'Speech recognition failed');
      const q = (j.text as string).trim();
      if (!q) { setS({ phase: 'error', error: "I didn't catch that. Hold V a little longer and speak up." }); return; }
      ask(q);
    } catch (e) { setS({ phase: 'error', error: (e as Error).message }); }
  }

  function ask(q: string) {
    let history: Msg[] = [];
    try { history = JSON.parse(localStorage.getItem(CHAT_KEY) ?? '[]'); } catch { /* none */ }
    const messages = [...history.slice(-10).map(m => ({ role: m.role, content: m.content.slice(0, 4000) })), { role: 'user' as const, content: q }];
    const f = player.finished;
    const context = {
      doing: player.phase === 'playing' ? 'playing right now' : 'between takes',
      exercise: player.chart?.title, bpm: player.chart && player.options ? Math.round(player.chart.bpm * player.options.speed) : undefined,
      lastTake: f ? summarizeRun(f) : undefined,
    };
    setS({ phase: 'thinking', q });
    askCoach<ChatReply>(`talk:${Date.now()}`, 'chat', { messages, context }, a => {
      const saved = [...history, { role: 'user', content: q }, { role: 'assistant', content: a.reply }];
      try { localStorage.setItem(CHAT_KEY, JSON.stringify(saved.slice(-30))); } catch { /* ignore */ }
      setS({ phase: 'answer', q, a: a.reply, chart: a.chart });
      void say(a.spoken ?? a.reply.split(/(?<=[.!?])\s/).slice(0, 2).join(' '), true);
      hide.current = window.setTimeout(() => setS({ phase: 'idle' }), 20000);
    });
  }

  // Hold V to talk (not while typing in a field).
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof Element && e.target.matches('input, textarea, select');
    const down = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'v' && !e.repeat && !typing(e)) { e.preventDefault(); void begin(); } };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'v' && !typing(e)) void end(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  const label = { idle: 'Hold V to ask the coach', listening: 'Listening… let go to ask', hearing: 'Getting your words…', thinking: 'The coach is thinking…', answer: '', error: '' }[s.phase];
  return (
    <div className="talk" aria-live="polite">
      {s.phase !== 'idle' && (
        <div className="talkBubble" onClick={() => setS({ phase: 'idle' })} title="Click to close">
          {s.q && <p><b>You:</b> {s.q}</p>}
          {s.a && <p><b>Coach:</b> {s.a}</p>}
          {s.chart && <button className="primary" onClick={async e => { e.stopPropagation(); const c = await saveChart(s.chart!, 'ai'); setS({ phase: 'idle' }); requestPlay({ chartId: c.id }); }}>Play "{s.chart.title}"</button>}
          {label && <p className="small">{label}</p>}
          {s.error && <p className="warn">{s.error}</p>}
        </div>
      )}
      <button className={`talkBtn ${s.phase === 'listening' ? 'on' : ''}`} aria-label="Hold to talk to the coach (or hold V)"
        title="Hold to talk to the coach (or hold V)"
        onPointerDown={e => { e.preventDefault(); void begin(); }} onPointerUp={() => void end()} onPointerLeave={() => void end()}>
        🎙
      </button>
    </div>
  );
}
