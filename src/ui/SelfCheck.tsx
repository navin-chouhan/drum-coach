import { useEffect, useRef, useState } from 'react';
import { onCoachAction } from '../coach/session';
import { DEMOS, type DemoId } from '../content/demos';
import { onHit } from '../input/hits';
import { TechniqueDemo } from './TechniqueDemo';
import { saveFile, stamp } from './download';


/**
 * Check yourself (R5): your camera as a mirror next to the technique diagram, and a 10-second replay of yourself.
 * At the kit: hi-hat × 1 records or stops, snare × 1 replays, Esc closes. The clip lives in memory only: nothing is
 * saved or sent, and closing throws it away.
 */
export function SelfCheck({ demo, bpm, onClose }: { demo: DemoId; bpm: number; onClose: () => void }) {
  const live = useRef<HTMLVideoElement>(null), replay = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream>(undefined), rec = useRef<MediaRecorder>(undefined), stopTimer = useRef<number>(undefined);
  const [state, setState] = useState<'starting' | 'live' | 'recording' | 'replay' | 'error'>('starting');
  const [clip, setClip] = useState<string>(), [clipS, setClipS] = useState(10); // 10 s to check yourself, 30 s for a teacher (N2)
  const blob = useRef<Blob>(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    let off = false;
    navigator.mediaDevices?.getUserMedia({ video: { width: 960, height: 540 }, audio: false })
      .then(s => { if (off) { s.getTracks().forEach(t => t.stop()); return; } stream.current = s; if (live.current) live.current.srcObject = s; setState('live'); })
      .catch(e => { setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Camera blocked: allow it in Chrome (the camera icon in the address bar).' : 'No camera found.'); setState('error'); });
    return () => { off = true; stream.current?.getTracks().forEach(t => t.stop()); clearTimeout(stopTimer.current); };
  }, []);
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip); }, [clip]); // the last clip, thrown away when replaced or closed

  const record = () => {
    if (!stream.current) return;
    if (rec.current?.state === 'recording') { rec.current.stop(); return; }
    const chunks: Blob[] = [], r = new MediaRecorder(stream.current);
    r.ondataavailable = e => chunks.push(e.data);
    r.onstop = () => { clearTimeout(stopTimer.current); blob.current = new Blob(chunks, { type: r.mimeType }); setClip(URL.createObjectURL(blob.current)); setState('replay'); };
    r.start(); rec.current = r; setState('recording');
    stopTimer.current = window.setTimeout(() => r.state === 'recording' && r.stop(), clipS * 1000);
  };
  const toggleReplay = () => setState(s => (s === 'replay' ? 'live' : clip ? 'replay' : s));
  const actions = useRef({ record, toggleReplay, onClose }); actions.current = { record, toggleReplay, onClose };

  useEffect(() => {
    const offHit = onHit(h => {
      if (h.pad === 'hhClosed' || h.pad === 'hhOpen') actions.current.record();
      if (h.pad === 'snare') actions.current.toggleReplay();
    });
    const offCmd = onCoachAction(() => true); // the kit's taps are ours while this is open
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') actions.current.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { offHit(); offCmd(); window.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => { if (state === 'replay' && replay.current && clip) { replay.current.src = clip; void replay.current.play().catch(() => {}); } }, [state, clip]);

  return (
    <div className="selfCheck" role="dialog" aria-label="Check yourself">
      <button className="link selfClose" onClick={onClose}>✕ Close (Esc)</button>
      <div className="selfMirror">
        <video ref={live} autoPlay muted playsInline className="mirror" style={{ display: state === 'replay' ? 'none' : 'block' }} />
        <video ref={replay} muted playsInline loop className="mirror" style={{ display: state === 'replay' ? 'block' : 'none' }} />
        {state === 'recording' && <span className="selfRec">● REC (up to {clipS} s)</span>}
        {state === 'replay' && <span className="selfRec replay">▶ REPLAY</span>}
        {state === 'error' && <p className="warn selfErr">{error}</p>}
        <div className="selfKeys"><i>hi-hat × 1</i> {state === 'recording' ? 'stop' : 'record'} · <i>snare × 1</i> {state === 'replay' ? 'mirror' : 'replay'} · <i>Esc</i> close</div>
      </div>
      <div className="selfSide">
        <TechniqueDemo id={demo} bpm={bpm} compact />
        <p className="selfLook">Look for:</p>
        <ul>{DEMOS[demo].watch.map(w => <li key={w}>{w}</li>)}</ul>
        <p className="small">Only on this laptop: the clip is never sent, and it's gone when you close this, unless you save it yourself (for a teacher).</p>
        <p><label>Clip length <select value={clipS} onChange={e => setClipS(+e.target.value)}><option value={10}>10 s</option><option value={30}>30 s (for a teacher)</option></select></label>
          {clip && blob.current && <button className="link" onClick={() => saveFile(`self-check ${stamp()}.webm`, blob.current!)}>💾 Save clip</button>}</p>
        <div className="actions"><button className="primary" onClick={record} disabled={state === 'starting' || state === 'error'}>{state === 'recording' ? '■ Stop' : '● Record 10 s'}</button>
          <button onClick={toggleReplay} disabled={!clip}>{state === 'replay' ? 'Back to the mirror' : '▶ Replay'}</button></div>
      </div>
    </div>
  );
}
