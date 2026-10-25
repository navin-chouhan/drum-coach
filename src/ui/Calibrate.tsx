import { useEffect, useState, useSyncExternalStore } from 'react';
import { CALIBRATION_ORDER, back, calibrate, initialCal, skip, type CalState } from '../engine/calibration';
import { DEFAULT_NOTE_MAP, PADS, PAD_INFO, findConflicts, type PadId } from '../engine/kit';
import { onHit } from '../input/hits';
import { getNoteMap, setNoteMap, subscribeNoteMap } from '../input/store';
import { EmulatedKitCard } from './EmulatedKitCard';
import { LatencyCard } from './LatencyCard';
import { SoundCheckCard } from './SoundCheckCard';

const MODULE_HELP = 'On the module: press MODE until VOICE lights, hit the pad, press PAGE until the display shows Nxx, then set the note with [–]/[+].';

export function Calibrate({ device }: { device: string }) {
  const map = useSyncExternalStore(subscribeNoteMap, getNoteMap);
  const [cal, setCal] = useState<CalState | null>(null);
  const [lastNote, setLastNote] = useState<{ note: number; velocity: number }>();

  useEffect(() => onHit(h => {
    setLastNote(h);
    setCal(s => (s ? calibrate(s, h.note, h.time) : s));
  }), []);

  const conflicts = findConflicts(map);
  const inConflict = new Set(conflicts.flat());
  const pad = cal && CALIBRATION_ORDER[cal.step];
  const done = cal && !pad;

  return (
    <div className="calibrate">
      <section className="card wizard" aria-live="polite">
        <h3>Hit each pad · {device}</h3>
        {!cal ? (
          <>
            <p>The wizard asks you to hit each pad once and records the MIDI note it sends.
              Nothing is saved until you press Save.</p>
            <button className="primary" onClick={() => setCal(initialCal())}>Start calibration</button>
          </>
        ) : done ? (
          <>
            <p>All pads recorded.</p>
            <div className="actions">
              <button className="primary" onClick={() => { setNoteMap({ ...map, ...cal.captured }); setCal(null); }}>Save</button>
              <button onClick={() => setCal(back(cal))}>Back</button>
              <button onClick={() => setCal(null)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="step">Step {cal.step + 1} of {CALIBRATION_ORDER.length}</div>
            <div className="prompt">Hit: <b>{PAD_INFO[pad!].name}</b></div>
            {PAD_INFO[pad!].hint && <p className="small">{PAD_INFO[pad!].hint}</p>}
            {cal.conflict && (
              <p className="warn">
                Note {cal.conflict.note} is already used by <b>{PAD_INFO[cal.conflict.pad].name}</b>, so the app can't
                tell these pads apart. Give this pad its own note. {MODULE_HELP} Then hit it again.
              </p>
            )}
            <div className="actions">
              <button onClick={() => setCal(back(cal))} disabled={cal.step === 0}>Back</button>
              <button onClick={() => setCal(skip(cal))}>Skip (keep {map[pad!]})</button>
              <button onClick={() => setCal(null)}>Cancel</button>
            </div>
          </>
        )}
        {cal && (
          <ol className="captured">
            {CALIBRATION_ORDER.map((p, i) => (
              <li key={p} className={i === cal.step ? 'current' : ''}>
                {PAD_INFO[p].name}: {cal.captured[p] ?? (i < cal.step ? `skipped (${map[p]})` : '…')}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card">
        <h3>Note map</h3>
        <p className="small">Last note received: {lastNote ? `${lastNote.note} (velocity ${lastNote.velocity})` : '—'}</p>
        <table className="notemap">
          <tbody>
            {PADS.map((p: PadId) => (
              <tr key={p} className={inConflict.has(p) ? 'conflict' : ''}>
                <td><label htmlFor={`note-${p}`}>{PAD_INFO[p].name}</label></td>
                <td>
                  <input id={`note-${p}`} type="number" min={0} max={127} value={map[p]}
                    onChange={e => {
                      const n = e.target.valueAsNumber;
                      if (Number.isInteger(n) && n >= 0 && n <= 127) setNoteMap({ ...map, [p]: n });
                    }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {conflicts.length > 0 && (
          <p className="warn">
            {conflicts.map(g => g.map(p => PAD_INFO[p].name).join(' and ')).join('; ')} share a note.
            Change it in the app if you set it wrong here, or on the module. {MODULE_HELP}
          </p>
        )}
        <button onClick={() => setNoteMap({ ...DEFAULT_NOTE_MAP })}>Reset to MPS-150 defaults</button>
      </section>
      <SoundCheckCard />
      <LatencyCard />
      <EmulatedKitCard />
    </div>
  );
}
