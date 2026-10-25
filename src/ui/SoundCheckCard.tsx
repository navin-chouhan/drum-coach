import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getSettings, setSettings, subscribeSettings, type Settings } from '../input/settings';
import { applyLevels, audio, click, whenRunning } from '../play/audio';
import { say } from '../voice/voice';

const BEAT = 60 / 90; // a relaxed groove tempo to play along with

/** Balance the laptop's sounds (through the module's AUX IN) against the kit in the same headphones. */
export function SoundCheckCard() {
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const [clicking, setClicking] = useState(false);
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
      <div className="actions">
        {clicking ? <button onClick={stopClick}>Stop click</button> : <button className="primary" onClick={() => whenRunning(startClick)}>Play click</button>}
        <button onClick={() => void say("This is my voice. If you can't hear me clearly over your drums, move the coach voice slider up.", true)}>Test coach voice</button>
      </div>
    </section>
  );
}
