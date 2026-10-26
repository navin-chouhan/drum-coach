import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getSettings, setSettings, subscribeSettings, type Settings } from '../input/settings';
import { applyLevels, audio, click, playBand, whenRunning } from '../play/audio';
import { onHit } from '../input/hits';
import { onCoachAction } from '../coach/session';
import { say } from '../voice/voice';

const BEAT = 60 / 90; // a relaxed groove tempo to play along with

/** Balance the laptop's sounds (through the module's AUX IN) against the kit in the same headphones. */
export function SoundCheckCard() {
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const [clicking, setClicking] = useState(false), [throne, setThrone] = useState(false);
  const timer = useRef<number>(undefined);
  const stopClick = () => { clearInterval(timer.current); setClicking(false); };
  useEffect(() => () => clearInterval(timer.current), []);

  function startClick() {
    const c = audio();
    let next = c.currentTime + 0.1, n = 0;
    const tick = () => { while (next < c.currentTime + 0.3) { click(next, n++ % 4 ? 1 : 0); next += BEAT; } }; // lookahead keeps it steady
    tick(); timer.current = window.setInterval(tick, 100); setClicking(true);
  }
  const set = (s: Partial<Settings>) => { setSettings(s); applyLevels(); };
  const slider = (key: 'clickVolume' | 'voiceVolume', label: string) => (
    <p><label className="check">{label}{' '}
      <input type="range" min={0.2} max={1.25} step={0.05} value={settings[key]} onChange={e => set({ [key]: Number(e.target.value) })} />
      {' '}{Math.round(settings[key] * 100)}%</label></p>
  );

  return (
    <section className="card">
      <h3>Sound check</h3>
      <p className="small">For headphones on the module with the laptop in its AUX IN. Set the laptop volume to about 70% and use the
        module's volume knob for your drums. Then play a simple beat along with the click and set the click so you hear it clearly
        over your drums. Last, set the coach's voice so it's clear but not louder than the kit.</p>
      {slider('clickVolume', 'Click and music')}
      {slider('voiceVolume', 'Coach voice')}
      <p><label className="check">Band (bass and keys under grooves){' '}
        <input type="range" min={0} max={1.25} step={0.05} value={settings.bandVolume ?? 0.6} onChange={e => set({ bandVolume: Number(e.target.value) })} />
        {' '}{Math.round((settings.bandVolume ?? 0.6) * 100)}%</label>{' '}
        <label className="check"><input type="checkbox" checked={settings.band !== false} onChange={e => set({ band: e.target.checked })} /> On</label></p>
      <div className="actions">
        {clicking ? <button onClick={stopClick}>Stop click</button> : <button className="primary" onClick={() => whenRunning(startClick)}>Play click</button>}
        <button onClick={() => void say("This is my voice. If you can't hear me clearly over your drums, move the coach voice slider up.", true)}>Test coach voice</button>
        <button onClick={() => { stopClick(); setThrone(true); }}>Check from the kit ▶</button>
      </div>
      {throne && <ThroneCheck onDone={() => setThrone(false)} />}
    </section>
  );
}

type Level = 'clickVolume' | 'bandVolume' | 'voiceVolume';
const STEPS: { key: Level; name: string; ask: string }[] = [
  { key: 'clickVolume', name: 'The click', ask: 'Play a simple beat along with the click. Can you hear it clearly over your drums?' },
  { key: 'bandVolume', name: 'The band', ask: 'Play a simple beat along with the band. How is it against your drums?' },
  { key: 'voiceVolume', name: 'The coach voice', ask: 'Listen to the coach. Clear, but not louder than the kit?' },
];
const ANSWERS = [['Too quiet', 'hi-hat × 1'], ['OK', 'snare × 1'], ['Too loud', 'floor × 1']] as const;
/** One step louder or quieter (answer 0 = too quiet, 2 = too loud), within the slider's range. */
export const nudgeLevel = (v: number, answer: number, key: Level) =>
  Math.round(Math.max(key === 'bandVolume' ? 0 : 0.2, Math.min(1.25, v + (answer === 0 ? 0.1 : answer === 2 ? -0.1 : 0))) * 100) / 100;

/**
 * The sound check from the throne (N9): the app plays the click, then the band, then the coach's voice; you answer with a
 * pad (hi-hat too quiet, snare OK, floor too loud, or keys 1–3) and it adjusts and plays it again until you say OK.
 */
function ThroneCheck({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0), step = STEPS[i];
  const loop = useRef<number>(undefined);
  const play = (k: number) => {
    clearInterval(loop.current);
    const c = audio(), s = STEPS[k];
    if (!s) return;
    if (s.key === 'voiceVolume') { void say("Can you hear me clearly over your drums? Answer with the hi-hat, snare or floor tom.", true); return; }
    let next = c.currentTime + 0.1, n = 0;
    const chords = [45, 45, 50, 52]; // A A D E, one per bar
    const tick = () => {
      for (; next < c.currentTime + 0.3; next += BEAT, n++) {
        if (s.key === 'clickVolume') click(next, n % 4 ? 1 : 0);
        else { const root = chords[Math.floor(n / 4) % 4]; playBand({ part: 'bass', midi: [root], vel: 95 }, next, BEAT * 0.9); if (n % 2 === 0) playBand({ part: 'keys', midi: [root + 24, root + 28, root + 31], vel: 60 }, next, BEAT * 1.8); }
      }
    };
    tick(); loop.current = window.setInterval(tick, 100);
  };
  const act = useRef<{ answer: (a: number) => void }>({ answer: () => {} });
  act.current.answer = (a: number) => {
    if (!step) return;
    if (a === 1) { const k = i + 1; setI(k); if (k >= STEPS.length) { clearInterval(loop.current); onDone(); } else play(k); return; }
    setSettings({ [step.key]: nudgeLevel(getSettings()[step.key] ?? (step.key === 'bandVolume' ? 0.6 : 1), a, step.key) }); applyLevels();
    if (step.key === 'voiceVolume') play(i);
  };
  useEffect(() => {
    whenRunning(() => play(0));
    const pads: Record<string, number> = { hhClosed: 0, hhOpen: 0, snare: 1, floor: 2 };
    const offHit = onHit(h => { if (h.pad && h.pad in pads && STEPS[i]) act.current.answer(pads[h.pad]); });
    const offCmd = onCoachAction(() => true); // the kit's taps answer here
    const onKey = (e: KeyboardEvent) => { if (/^[123]$/.test(e.key)) act.current.answer(Number(e.key) - 1); };
    window.addEventListener('keydown', onKey);
    return () => { clearInterval(loop.current); offHit(); offCmd(); window.removeEventListener('keydown', onKey); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once; the answer handler reads the current step through the ref
  if (!step) return null;
  return (
    <div className="card throneCheck" aria-live="polite">
      <h3>Sound check · {i + 1} of {STEPS.length}</h3>
      <p className="big">{step.name}</p>
      <p>{step.ask} (now {Math.round((getSettings()[step.key] ?? (step.key === 'bandVolume' ? 0.6 : 1)) * 100)}%)</p>
      <div className="ans">{ANSWERS.map(([label, g], a) => <button key={label} className={`move ${a === 1 ? 'go' : ''}`} onClick={() => act.current.answer(a)}><b>{label}</b><span className="g"><i>{g}</i> or key {a + 1}</span></button>)}</div>
      <button className="link" onClick={onDone}>Stop</button>
    </div>
  );
}
