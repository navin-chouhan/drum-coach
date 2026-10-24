import { useEffect, useState } from 'react';
import { PAD_INFO } from '../engine/kit';
import { onHit, type Hit } from '../input/hits';
import { DRUM_BY_ID } from './drums';

export function LastHit({ onCalibrate }: { onCalibrate: () => void }) {
  const [hit, setHit] = useState<Hit>();
  useEffect(() => onHit(setHit), []);
  const color = hit?.pad ? DRUM_BY_ID[PAD_INFO[hit.pad].drum].color : 'var(--muted)';
  return (
    <div className="card">
      <h3>Last hit</h3>
      <div className="lastName" style={{ color }}>{hit ? (hit.pad ? PAD_INFO[hit.pad].name : `Note ${hit.note}`) : '—'}</div>
      <div className="lastMeta">
        {!hit ? 'Hit a pad to start'
          : hit.pad ? `Note ${hit.note} · velocity ${hit.velocity}`
          : <>Not mapped to a pad · velocity {hit.velocity} · <button className="link" onClick={onCalibrate}>Calibrate</button></>}
      </div>
      <div className="velbar"><i style={{ width: `${((hit?.velocity ?? 0) / 127) * 100}%`, background: color }} /></div>
    </div>
  );
}
