import { useEffect, useRef, useState } from 'react';
import { canRunAction, runAction, say, useCoach } from '../coach/session';
import { recordWhileHeld, transcribe, type Recording } from './listen';

/**
 * The coach, always at hand (bottom right): what it just said, its suggested next step as one big button,
 * and the mic. Hold V (or the mic) and talk; let go to send. Hands-free answers happen automatically
 * when the coach asks a question (see coach/session.ts).
 */
export function TalkToCoach() {
  const coach = useCoach();
  const [mic, setMic] = useState<'idle' | 'recording' | 'hearing'>('idle');
  const [err, setErr] = useState('');
  const [closedAt, setClosedAt] = useState(-1); // hidden until the coach does something newer
  const rec = useRef<Recording | null>(null);

  async function begin() {
    if (rec.current) return;
    setErr('');
    try { rec.current = await recordWhileHeld(); setMic('recording'); }
    catch { setErr('Microphone blocked: allow it via the icon left of the address bar.'); }
  }
  async function end() {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setMic('hearing');
    try {
      const blob = await r.stop();
      const text = blob ? await transcribe(blob) : '';
      if (text) void say(text); else setErr("I didn't catch that. Hold V a little longer.");
    } catch (e) { setErr((e as Error).message); }
    setMic('idle');
  }
  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof Element && e.target.matches('input, textarea, select');
    const down = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'v' && !e.repeat && !typing(e)) { e.preventDefault(); void begin(); } };
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'v' && !typing(e)) void end(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  });

  const status = mic === 'recording' ? 'Listening… let go to send'
    : mic === 'hearing' || coach.status === 'hearing' ? 'Getting your words…'
    : coach.status === 'listening' ? 'Listening for your answer…'
    : coach.status === 'thinking' ? 'Thinking…' : '';
  const r = coach.reply, a = r?.action;
  const show = (closedAt < coach.at || mic !== 'idle' || !!err) && (r || status || err || coach.error);
  return (
    <div className="talk" aria-live="polite">
      {show && (
        <div className="talkBubble">
          <button className="link talkClose" onClick={() => { setClosedAt(Date.now()); setErr(''); }} aria-label="Hide the coach's message">✕</button>
          <span className="briefingWho">Coach</span>
          {coach.heard && coach.status !== 'idle' && <p className="small"><b>You:</b> {coach.heard}</p>}
          {r && <p>{r.show ?? r.say}</p>}
          {a && !a.now && canRunAction(a) && <button className="primary talkAction" onClick={() => void runAction(a)}>{a.label}</button>}
          {status && <p className={`small ${coach.status === 'listening' || mic === 'recording' ? 'listening' : ''}`}><span className="spinner" aria-hidden /> {status}</p>}
          {(err || coach.error) && <p className="warn">{err || coach.error}</p>}
        </div>
      )}
      <button className={`talkBtn ${mic === 'recording' || coach.status === 'listening' ? 'on' : ''}`}
        aria-label="Hold to talk to the coach (or hold V)" title="Hold to talk to the coach (or hold V)"
        onPointerDown={e => { e.preventDefault(); void begin(); }} onPointerUp={() => void end()} onPointerLeave={() => void end()}>
        🎙
      </button>
    </div>
  );
}
