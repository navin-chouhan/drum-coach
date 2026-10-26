import { useState } from 'react';
import { DEMOS, DEMO_IDS, type DemoId } from '../content/demos';
import { SelfCheck } from './SelfCheck';
import { TechniqueDemo } from './TechniqueDemo';

/** Stick technique: every "How it moves" movement in one place, any time (not only inside a lesson). */
export function TechniqueView({ onBack }: { onBack: () => void }) {
  const [id, setId] = useState<DemoId>('grip'), [bpm, setBpm] = useState(60), [checking, setChecking] = useState(false);
  return (
    <div className="today techniqueView">
      {checking && <SelfCheck demo={id} bpm={bpm} onClose={() => setChecking(false)} />}
      <div className="card">
        <button className="link back" onClick={onBack}>← Journey</button>
        <h2>🥢 Stick technique</h2>
        <p>How to hold the sticks and how each stroke moves, drawn from the side. Watch it slowly, try it in the air, then check yourself with the camera.</p>
        <div className="demos">{DEMO_IDS.map(d => <button key={d} className={d === id ? 'on' : ''} onClick={() => setId(d)}>{DEMOS[d].title}</button>)}</div>
      </div>
      <div className="card">
        <TechniqueDemo key={id} id={id} bpm={bpm} />
        <div className="actions">
          {id !== 'grip' && <label>Tempo <select value={bpm} onChange={e => setBpm(+e.target.value)}>{[40, 50, 60, 70, 80, 100].map(b => <option key={b}>{b}</option>)}</select> BPM</label>}
          <button className="primary" onClick={() => setChecking(true)}>📷 Check yourself</button>
        </div>
      </div>
    </div>
  );
}
