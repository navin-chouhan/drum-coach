import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PAD_INFO, type PadId } from '../engine/kit';
import { measurePad, type KitCalibration } from '../engine/padCal';
import { parseMidiMessage } from '../engine/midi';
import { onHit, onRawMidi } from '../input/hits';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { getNoteMap, getPadCal, setPadCal, subscribeNoteMap } from '../input/store';

// Fair hardware (N9): each pad's soft and loud, and its own retriggers, so dynamics are judged the same on every pad.
const PADS: PadId[] = ['kick', 'snare', 'hhClosed', 'tom1', 'tom2', 'floor', 'crash', 'ride'];
const STROKES = 4, GAP_MS = 150; // four strokes each; strokes closer than this to the last one are its retriggers
type Phase = 'soft' | 'loud';

/**
 * "Soft, then loud": for each pad, four soft taps then four loud strokes. Reads the raw MIDI (retriggers included) from
 * the kit; with no kit, the keyboard (Shift = loud). Stop keeps what's done.
 */
export function VelocityWizard({ device }: { device: string }) {
  const cal = useSyncExternalStore(subscribeNoteMap, getPadCal);
  const [on, setOn] = useState(false), [i, setI] = useState(0), [phase, setPhase] = useState<Phase>('soft');
  const [softs, setSofts] = useState<number[]>([]), [louds, setLouds] = useState<{ time: number; velocity: number }[]>([]);
  const [done, setDone] = useState<KitCalibration>({});
  const pad = PADS[i];
  const mains = (xs: { time: number; velocity: number }[]) => xs.filter((h, k) => !k || h.time - xs[k - 1].time >= GAP_MS).length;

  const take = useRef<(note: number, velocity: number, time: number) => void>(() => {});
  take.current = (note, velocity, time) => {
    if (!on || !pad || note !== getNoteMap()[pad] || !velocity) return;
    if (phase === 'soft') {
      const next = [...softs, velocity];
      setSofts(next);
      if (next.length >= STROKES) setPhase('loud');
    } else {
      const next = [...louds, { time, velocity }];
      setLouds(next);
      if (mains(next) >= STROKES) setTimeout(() => finishPad([...next]), 300); // wait a moment: its last retrigger
    }
  };
  useEffect(() => {
    const kit = device !== 'keyboard';
    // the kit: raw MIDI, so the retriggers the input filter would drop are seen too; no kit: the keyboard's hits
    const offRaw = onRawMidi((data, time) => { const n = kit && parseMidiMessage(data); if (n) take.current(n.note, n.velocity, time); });
    const offHit = onHit(h => { if (!kit) take.current(h.note, h.velocity, h.time); });
    return () => { offRaw(); offHit(); };
  }, [device]);

  function finishPad(l = louds) {
    const next = { ...done, [pad]: measurePad(softs, l) };
    setDone(next); nextPad(next);
  }
  function nextPad(d = done) {
    setSofts([]); setLouds([]); setPhase('soft');
    if (i + 1 >= PADS.length) { setPadCal({ ...getPadCal(), ...d }); setOn(false); setI(0); setDone({}); return; }
    setI(i + 1);
  }
  const stop = () => { if (Object.keys(done).length) setPadCal({ ...getPadCal(), ...done }); setOn(false); setI(0); setDone({}); setSofts([]); setLouds([]); setPhase('soft'); };
  const dots = (n: number) => '●'.repeat(Math.min(n, STROKES)) + '○'.repeat(Math.max(0, STROKES - n));
  const summary = Object.entries(cal) as [PadId, NonNullable<KitCalibration[PadId]>][];

  return (
    <section className="card wizard" aria-live="polite">
      <h3>Soft, then loud · {device}</h3>
      {!on ? <>
        <p>Every pad reads stroke heights a little differently. Four soft taps and four loud strokes per pad let the app judge
          accents, ghost notes and soft/loud parts the same on every pad, and filter each pad's own double-triggers. About 2 minutes.</p>
        {device === 'keyboard' && <p className="small">No kit plugged in: the keyboard works for trying it (Shift = loud), but calibrate with the kit.</p>}
        <div className="actions"><button className="primary" onClick={() => setOn(true)}>Start: soft, then loud</button>
          {summary.length > 0 && <button onClick={() => setPadCal({})}>Reset (plain MIDI velocity)</button>}</div>
        {summary.length > 0 && <ul className="small calSummary">{summary.map(([p, c]) => <li key={p}><b>{PAD_INFO[p].name}</b>: soft {Math.round(c.soft)}, loud {Math.round(c.loud)}
          {c.bounceMs ? ` · retriggers within ${c.bounceMs} ms at under ${Math.round((c.bounceRatio ?? 0) * 100)}%: filtered` : ' · no retriggers seen'}</li>)}</ul>}
      </> : <>
        <div className="step">Pad {i + 1} of {PADS.length}</div>
        <div className="prompt">{PAD_INFO[pad].name}: four <b>{phase}</b> {phase === 'soft' ? 'taps (3 cm)' : 'strokes (full height)'}</div>
        <p className="calDots">Soft {dots(softs.length)} &nbsp; Loud {dots(mains(louds))}</p>
        <div className="actions">
          <button onClick={() => { setSofts([]); setLouds([]); setPhase('soft'); }}>◀ Redo this pad</button>
          <button onClick={() => nextPad()}>Skip this pad</button>
          <button className="link" onClick={stop}>Stop (keeps what's done)</button>
        </div>
        <ol className="captured">{PADS.map((p, k) => <li key={p} className={k === i ? 'current' : ''}>{PAD_INFO[p].name}: {done[p] ? `soft ${Math.round(done[p]!.soft)} · loud ${Math.round(done[p]!.loud)}` : k < i ? 'skipped' : '…'}</li>)}</ol>
      </>}
    </section>
  );
}

/** Left-handed (N9): hints, intro slides and "How it moves" mirror R and L. Scoring doesn't change. */
export function LeftHandedCard() {
  const s = useSyncExternalStore(subscribeSettings, getSettings);
  return (
    <section className="card">
      <h3>Which hand leads</h3>
      <label className="check"><input type="checkbox" checked={!!s.leftHanded} onChange={e => setSettings({ leftHanded: e.target.checked })} /> I play left-handed (hi-hat on my right, I lead with my left)</label>
      <p className="small">Every hint, intro slide and "How it moves" drawing swaps R and L. Scoring is the same: the kit tells the app which pad, not which hand.</p>
    </section>
  );
}
