import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { estimateLatency } from '../engine/scoring';
import { onHit } from '../input/hits';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { audio, audioToPerf, click } from '../play/audio';

const BPM = 90, COUNT_IN = 4, CLICKS = 16;

/** Tap any pad along with 16 clicks; the median offset becomes the latency correction used in scoring. */
export function LatencyCard() {
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [result, setResult] = useState<ReturnType<typeof estimateLatency>>(null);
  const [taps, setTaps] = useState(0);
  const cancel = useRef<() => void>(() => {});
  useEffect(() => () => cancel.current(), []);

  function run() {
    const c = audio(), beat = 60 / BPM, t0 = c.currentTime + 0.3;
    const clicks: number[] = [], hits: number[] = [];
    for (let i = 0; i < COUNT_IN + CLICKS; i++) {
      click(t0 + i * beat, i % 4 === 0 ? 0 : 1);
      if (i >= COUNT_IN) clicks.push(audioToPerf(t0 + i * beat));
    }
    setState('running'); setTaps(0); setResult(null);
    const off = onHit(h => { if (h.time > clicks[0] - 300) { hits.push(h.time); setTaps(hits.length); } });
    const timer = setTimeout(() => {
      off();
      setResult(estimateLatency(clicks, hits));
      setState('done');
    }, (0.3 + (COUNT_IN + CLICKS) * beat + 0.5) * 1000);
    cancel.current = () => { off(); clearTimeout(timer); };
  }

  return (
    <section className="card">
      <h3>Latency</h3>
      <p className="small">Current correction: <b>{settings.latencyMs} ms</b>. Press Start, listen to 4 count-in clicks, then hit any pad
        exactly with the next {CLICKS} clicks. Use the same headphones/speakers you practise with.</p>
      {state === 'running' && <p className="prompt">Tap along… {taps}/{CLICKS}</p>}
      {state === 'done' && (result
        ? <p>You hit on average <b>{Math.abs(result.latencyMs)} ms {result.latencyMs >= 0 ? 'after' : 'before'}</b> the click
            ({result.n} taps, spread ±{result.spread} ms).</p>
        : <p className="warn">Not enough taps close to the clicks. Try again.</p>)}
      <div className="actions">
        <button onClick={run} disabled={state === 'running'}>Start</button>
        {state === 'done' && result && <button className="primary" onClick={() => setSettings({ latencyMs: result.latencyMs })}>Save {result.latencyMs} ms</button>}
        {settings.latencyMs !== 0 && <button onClick={() => setSettings({ latencyMs: 0 })}>Reset to 0</button>}
      </div>
    </section>
  );
}
