import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { CALIBRATION_ORDER, back, calibrate, initialCal, skip, type CalState } from '../engine/calibration';
import { DEFAULT_NOTE_MAP, PADS, PAD_INFO, findConflicts, type PadId } from '../engine/kit';
import { lateTakes, type RunRow } from '../engine/progress';
import { onHit, type Hit } from '../input/hits';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { getNoteMap, getPadCal, setNoteMap, subscribeNoteMap } from '../input/store';
import { today } from '../lesson/state';
import { EmulatedKitCard } from './EmulatedKitCard';
import { LatencyCard } from './LatencyCard';
import { VelocityWizard } from './PadCalibration';
import { SoundCheckCard } from './SoundCheckCard';

const MODULE_HELP = 'On the module: press MODE until VOICE lights, hit the pad, press PAGE until the display shows Nxx, then set the note with [–]/[+].';
type Check = 'latency' | 'pads' | 'velocity' | 'sound' | 'hand' | 'kit';

/**
 * Setup → Your kit: the kit's status at a glance, then one checklist. Each check says what it fixes and how long it
 * takes, and opens in place. Latency comes first when your recent takes all lean late (that's usually the speakers).
 */
export function Calibrate({ device, soundOn }: { device?: string; soundOn: boolean }) {
  const s = useSyncExternalStore(subscribeSettings, getSettings);
  const map = useSyncExternalStore(subscribeNoteMap, getNoteMap), padCal = useSyncExternalStore(subscribeNoteMap, getPadCal);
  const [open, setOpen] = useState<Check>();
  const [runs, setRuns] = useState<RunRow[]>([]);
  useEffect(() => { fetch('/api/runs').then(r => r.json()).then(setRuns).catch(() => {}); }, []);
  const [last, setLast] = useState<Hit>();
  useEffect(() => onHit(setLast), []);
  const late = lateTakes(runs);
  const conflicts = findConflicts(map), inConflict = new Set(conflicts.flat());
  const padCount = Object.keys(padCal).length;
  const rows: { id: Check; done: boolean; title: string; time?: string; text: ReactNode; why?: string; first?: boolean; button?: string; control?: ReactNode; tool?: ReactNode }[] = [
    { id: 'latency', done: !!s.latencyChecked, title: 'Latency', time: '1 min', first: !s.latencyChecked,
      text: s.latencyChecked ? `Measured: the app takes ${s.latencyMs} ms off every hit. Measure again if you change speakers or headphones.`
        : 'Tap a pad with the click 16 times. The app learns how late your speakers or headphones are and corrects every score.',
      why: !s.latencyChecked && late ? `Your last ${late.of} takes ${late.takes === late.of ? 'all ' : ''}landed about ${(late.ms / 1000).toFixed(1)} s after the click. If that's the setup, this fixes it.` : undefined,
      tool: <LatencyCard onSaved={() => setOpen(undefined)} /> },
    { id: 'pads', done: !!s.padsCheckedAt || !!s.setupDone, title: 'Hit each pad once', time: '30 s',
      text: <>So a hit on tom 1 counts as tom 1. Worth redoing after you change a note on the module.{s.padsCheckedAt && ` Last checked ${s.padsCheckedAt}.`}</>,
      tool: <PadWizard big device={device ?? 'keyboard'} autoStart onSaved={() => setOpen(undefined)} onCancel={() => setOpen(undefined)} /> },
    { id: 'velocity', done: padCount > 0, title: 'Soft, then loud', time: '2 min',
      text: padCount ? `Done for ${padCount} pad${padCount === 1 ? '' : 's'}: accents and ghost notes are judged the same on each of them.` : 'Four soft and four loud strokes per pad, so accents and ghost notes are judged fairly on every pad.',
      tool: <VelocityWizard device={device ?? 'keyboard'} /> },
    { id: 'sound', done: !!s.soundChecked || s.clickVolume !== 1 || s.voiceVolume !== 1 || s.bandVolume !== undefined, title: 'Sound levels', time: '1 min',
      text: `Click and music ${Math.round(s.clickVolume * 100)}% · coach voice ${Math.round(s.voiceVolume * 100)}% · band ${Math.round((s.bandVolume ?? 0.6) * 100)}%. Check them from the throne with a simple beat.`,
      tool: <SoundCheckCard /> },
    { id: 'hand', done: true, title: 'Which hand leads', text: 'Hints, intro slides and How it moves follow this. Scoring doesn\'t change.',
      control: <span className="seg" role="group" aria-label="Which hand leads">
        <button className={!s.leftHanded ? 'on' : ''} aria-pressed={!s.leftHanded} onClick={() => setSettings({ leftHanded: false })}>Right-handed</button>
        <button className={s.leftHanded ? 'on' : ''} aria-pressed={!!s.leftHanded} onClick={() => setSettings({ leftHanded: true })}>Left-handed</button></span> },
    { id: 'kit', done: !!device, title: 'Kit connected',
      text: device ? `${device}. If it ever says "blocked": the icon left of the address bar → allow MIDI.` : 'Plug the kit in over USB (Chrome on Linux, not snap Chromium). The keyboard works meanwhile: Space kick, S snare, A hi-hat…',
      control: <span /> },
  ];
  const ordered = [...rows.filter(r => !r.done), ...rows.filter(r => r.done)];
  const firstOpen = ordered.find(r => !r.done)?.id;
  const done = rows.filter(r => r.done).length;

  return (
    <div className="setup">
      <div className="card setupStatus">
        <div className="ring" style={{ '--p': `${(done / rows.length) * 100}%` } as React.CSSProperties}><div>{done} of {rows.length}<br />done</div></div>
        <div><h2>{device ?? 'No kit plugged in'}</h2>
          <div className="lights">
            <span className={`light ${device ? '' : 'bad'}`}><i />{device ? 'Kit connected' : 'Kit not found'}</span>
            <span className={`light ${soundOn ? '' : 'bad'}`}><i />{soundOn ? 'Sound on' : 'Sound off: click anywhere'}</span>
            <span className={`light ${s.latencyChecked ? '' : 'warn'}`}><i />{s.latencyChecked ? `Latency ${s.latencyMs} ms` : 'Latency not measured'}</span>
          </div></div>
        <div className="lastHit" aria-live="polite">{last ? (last.pad ? PAD_INFO[last.pad].name : `Note ${last.note}`) : 'Hit a pad'}
          <small>{last ? `${last.pad ? `note ${last.note} · ` : 'not mapped · '}velocity ${last.velocity}` : 'the last hit shows here'}</small></div>
      </div>

      <div className="card checks">
        <h3>Get your kit ready</h3>
        {ordered.map(r => (
          <div key={r.id} className={`chk ${r.done ? 'ok' : 'todo'} ${r.first && r.id === firstOpen ? 'first' : ''}`}>
            <span className="st" aria-hidden>{r.done ? '✓' : '!'}</span>
            <span><b>{r.title}</b>{r.time && <span className="t">{r.time}</span>}{r.first && r.id === firstOpen && <span className="tag1">DO THIS FIRST</span>}
              <p>{r.text}</p>{r.why && <p className="why">{r.why}</p>}</span>
            {r.control ?? <button className={!r.done && r.id === firstOpen ? 'primary' : ''} aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? undefined : r.id)}>
              {open === r.id ? 'Close' : r.done ? 'Do it again' : 'Start ▶'}</button>}
            {open === r.id && r.tool && <div className="chkTool">{r.tool}</div>}
          </div>
        ))}
      </div>

      <details className="card adv">
        <summary>Advanced: note map, emulated kit</summary>
        <p className="small">The note each pad sends. "Hit each pad once" fills this in; change a number only if you changed it on the module
          (VOICE → PAGE to Nxx). Last note received: {last ? `${last.note} (velocity ${last.velocity})` : '—'}</p>
        <div className="noteGrid">
          {PADS.map((p: PadId) => (
            <label key={p} className={inConflict.has(p) ? 'conflict' : ''}>{PAD_INFO[p].name}
              <input type="number" min={0} max={127} value={map[p]}
                onChange={e => { const n = e.target.valueAsNumber; if (Number.isInteger(n) && n >= 0 && n <= 127) setNoteMap({ ...map, [p]: n }); }} /></label>
          ))}
        </div>
        {conflicts.length > 0 && <p className="warn">
          {conflicts.map(g => g.map(p => PAD_INFO[p].name).join(' and ')).join('; ')} share a note.
          Change it in the app if you set it wrong here, or on the module. {MODULE_HELP}</p>}
        <p><button onClick={() => setNoteMap({ ...DEFAULT_NOTE_MAP })}>Reset to MPS-150 defaults</button></p>
        <p className="small"><b>For testing the app without playing:</b></p>
        <EmulatedKitCard />
      </details>
    </div>
  );
}

// The MPS-150 from above, for the pad wizard: [drawing id, name, x, y, r]; the kick and the hi-hat pedal are boxes.
const KIT: [string, string, number, number, number][] = [['hihat', 'Hi-hat', 90, 120, 46], ['crash', 'Crash', 170, 60, 44], ['tom1', 'Tom 1', 270, 92, 34], ['tom2', 'Tom 2', 360, 92, 34],
  ['ride', 'Ride', 470, 70, 50], ['snare', 'Snare', 190, 190, 42], ['floor', 'Floor tom', 430, 196, 44]];
const SPOT: Record<PadId, string> = { kick: 'kick', snare: 'snare', hhOpen: 'hihat', hhClosed: 'hihat', hhPedal: 'pedal', tom1: 'tom1', tom2: 'tom2', floor: 'floor', crash: 'crash', ride: 'ride' };
const WHERE: Partial<Record<PadId, string>> = { kick: 'Your right foot.', snare: 'The drum between your knees.', hhOpen: 'The hi-hat, with the pedal up.', hhPedal: 'Press the hi-hat pedal down once.',
  tom1: 'The small tom on the left, above the snare.', tom2: 'The tom on the right, above the kick.', floor: 'The big tom on your right.', crash: 'The cymbal on the left.', ride: 'The big cymbal on the right.' };

/** Your kit from above: the pad to hit pulses in yellow, the ones done are green. */
function KitMap({ cur, done }: { cur?: PadId; done: (spot: string) => boolean }) {
  const now = cur && SPOT[cur];
  const box = (id: string, name: string, x: number, y: number, w: number, h: number) => (
    <g key={id} className={id === now ? 'pulse' : ''}><rect x={x} y={y} width={w} height={h} rx={8} className={id === now ? 'now' : done(id) ? 'ok' : ''} />
      <text x={x + w / 2} y={y + h / 2 + 5} textAnchor="middle" className={id === now ? 'now' : ''}>{done(id) && id !== now ? '✓ ' : ''}{name}</text></g>);
  return (
    <svg className="kitMap" viewBox="0 0 560 300" role="img" aria-label={`Your kit from above${cur ? `, ${PAD_INFO[cur].name} highlighted` : ''}`}>
      {KIT.map(([id, name, x, y, r]) => (
        <g key={id} className={id === now ? 'pulse' : ''}><circle cx={x} cy={y} r={r} className={id === now ? 'now' : done(id) ? 'ok' : ''} />
          <text x={x} y={y + 5} textAnchor="middle" className={id === now ? 'now' : ''}>{done(id) && id !== now ? '✓ ' : ''}{name}</text></g>))}
      {box('kick', 'Kick', 250, 226, 110, 54)}
      {box('pedal', 'HH pedal', 30, 236, 100, 40)}
    </svg>
  );
}

/**
 * "Hit each pad once": records the note each pad sends (Setup → Your kit, and step 2 of onboarding). `big`: the pad to
 * hit in huge type on a drawing of the kit, readable from the throne; hitting the pad is the answer (← back, Esc stop).
 */
export function PadWizard({ device, autoStart, onSaved, onCancel, big }: { device: string; autoStart?: boolean; onSaved?: () => void; onCancel?: () => void; big?: boolean }) {
  const map = useSyncExternalStore(subscribeNoteMap, getNoteMap);
  const [cal, setCal] = useState<CalState | null>(autoStart ? initialCal() : null);
  useEffect(() => onHit(h => setCal(s => (s ? calibrate(s, h.note, h.time) : s))), []);
  const pad = cal && CALIBRATION_ORDER[cal.step];
  const done = cal && !pad;
  const cancel = () => { setCal(null); onCancel?.(); };
  const save = () => { setNoteMap({ ...map, ...cal!.captured }); setSettings({ padsCheckedAt: today() }); setCal(null); onSaved?.(); };
  useEffect(() => {
    if (!big || !cal) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') setCal(c => c && back(c)); if (e.key === 'Escape') { setCal(null); onCancel?.(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [big, !!cal]); // eslint-disable-line react-hooks/exhaustive-deps -- while it runs
  const heard = cal && <ol className={big ? 'heard' : 'captured'}>
    {CALIBRATION_ORDER.map((p, i) => (
      <li key={p} className={i === cal.step ? 'current' : cal.captured[p] !== undefined ? 'ok' : ''}>
        <span>{cal.captured[p] !== undefined && big ? '✓ ' : ''}{PAD_INFO[p].name}</span>{big ? <span>{cal.captured[p] ?? (i < cal.step ? `kept ${map[p]}` : i === cal.step ? '…' : '')}</span>
          : `: ${cal.captured[p] ?? (i < cal.step ? `skipped (${map[p]})` : '…')}`}
      </li>
    ))}
  </ol>;
  const conflict = cal?.conflict && <p className="warn">
    Note {cal.conflict.note} is already used by <b>{PAD_INFO[cal.conflict.pad].name}</b>, so the app can't
    tell these pads apart. Give this pad its own note. {MODULE_HELP} Then hit it again.</p>;

  if (big && cal) return (
    <div className="padWizard" aria-live="polite">
      <div className="wiz">
        <div className="wizBig">
          <div className="k">{done ? 'All pads' : `Pad ${cal.step + 1} of ${CALIBRATION_ORDER.length}`} · {device}</div>
          <h2>{done ? 'All done!' : `Hit ${PAD_INFO[pad!].name.toUpperCase()}`}</h2>
          <p>{done ? 'Save, and every hit counts on the right pad.' : PAD_INFO[pad!].hint ?? WHERE[pad!]}</p>
          <KitMap cur={pad ?? undefined} done={spot => CALIBRATION_ORDER.some(p => SPOT[p] === spot && cal.captured[p] !== undefined) && !(spot === 'hihat' && (cal.captured.hhOpen === undefined || cal.captured.hhClosed === undefined))} />
        </div>
        <div className="card"><h3>What each pad sent</h3>{heard}
          <p className="small">If two pads send the same note, it stops and shows how to fix it on the module.</p></div>
      </div>
      {conflict}
      <div className="moves wizMoves">
        {done ? <button className="move go" onClick={save}><b>✓ Save</b></button>
          : <button className="move alt" onClick={() => setCal(skip(cal))}><b>Skip this pad</b><span className="g small">keeps {map[pad!]}</span></button>}
        <button className="move alt" disabled={cal.step === 0} onClick={() => setCal(back(cal))}><b>↶ Back</b><span className="g"><i>key ←</i></span></button>
        <button className="move alt" onClick={cancel}><b>✕ Stop</b><span className="g"><i>Esc</i></span></button>
      </div>
    </div>
  );

  return (
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
              <button className="primary" onClick={save}>Save</button>
              <button onClick={() => setCal(back(cal))}>Back</button>
              <button onClick={cancel}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="step">Step {cal.step + 1} of {CALIBRATION_ORDER.length}</div>
            <div className="prompt">Hit: <b>{PAD_INFO[pad!].name}</b></div>
            {PAD_INFO[pad!].hint && <p className="small">{PAD_INFO[pad!].hint}</p>}
            {conflict}
            <div className="actions">
              <button onClick={() => setCal(back(cal))} disabled={cal.step === 0}>Back</button>
              <button onClick={() => setCal(skip(cal))}>Skip (keep {map[pad!]})</button>
              <button onClick={cancel}>Cancel</button>
            </div>
          </>
        )}
        {heard}
      </section>
  );
}
