import { useState } from 'react';
import { beatsPerBar, type Chart, type ChartDrum } from '../engine/chart';
import { gridScore } from '../engine/transcribe';
import { ROWS } from '../youtube/GridEditor';
import { DRUM_BY_ID } from '../ui/drums';

const NAME: Partial<Record<ChartDrum, string>> = { hihat: 'Hi-hat', hhOpen: 'HH open', hhPedal: 'HH foot', ride: 'Ride', crash: 'Crash', tom1: 'Tom 1', tom2: 'Tom 2', floor: 'Floor', snare: 'Snare', kick: 'Kick' };
const PASS = 80;
const stepsOf = (c: Chart) => [2, 4, 3].find(k => c.notes.every(n => Math.abs(n.t * k - Math.round(n.t * k)) < 1e-6)) ?? 4;

/**
 * Transcription (N7): hear a groove, write it on the grid (drums the chart uses × its steps), check it against the
 * real chart. 80% passes; after two checks "Show me" fills in the answer.
 */
export function Transcribe({ chart, play, onDone }: { chart: Chart; play: (c: Chart) => void; onDone: () => void }) {
  const spb = stepsOf(chart), bpb = beatsPerBar(chart), cols = chart.bars * bpb * spb;
  const lanes = ROWS.filter(d => chart.notes.some(n => n.drum === d));
  const [cells, setCells] = useState<Set<string>>(new Set()), [checked, setChecked] = useState<ReturnType<typeof gridScore>>(), [tries, setTries] = useState(0);
  const key = (d: ChartDrum, c: number) => `${d}:${c}`;
  const answer = new Set(chart.notes.map(n => key(n.drum, Math.round(n.t * spb))));
  const toggle = (k: string) => { setChecked(undefined); setCells(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }); };
  const written = () => [...cells].map(k => { const [d, c] = k.split(':'); return { drum: d as ChartDrum, t: +c / spb }; });
  const check = () => { setChecked(gridScore(written(), chart.notes, spb)); setTries(t => t + 1); };
  const ok = !!checked && checked.pct >= PASS;
  return (
    <div className="card transcribe">
      <p className="quizQ">Listen, then write it: tap the boxes where each drum plays.</p>
      <div className="tGrid" style={{ gridTemplateColumns: `5rem repeat(${cols}, 1fr)` }} role="grid">
        <span />
        {Array.from({ length: cols }, (_, c) => <span key={c} className="tHead">{c % spb === 0 ? (c / spb) % bpb + 1 : spb === 3 ? '' : spb === 2 ? '&' : ['', 'e', '&', 'a'][c % spb]}</span>)}
        {lanes.map(d => [
          <span key={d} className="tLane">{NAME[d]}</span>,
          ...Array.from({ length: cols }, (_, c) => {
            const k = key(d, c), on = cells.has(k), state = checked ? (on ? (answer.has(k) ? 'right' : 'wrong') : answer.has(k) ? 'missed' : '') : '';
            return <button key={k} className={`tCell ${on ? 'on' : ''} ${state} ${c % spb === 0 ? 'beat' : ''}`} style={on ? { background: DRUM_BY_ID[d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d].color } : undefined}
              aria-pressed={on} aria-label={`${NAME[d]}, step ${c + 1}${state ? `, ${state}` : ''}`} onClick={() => toggle(k)}>{state === 'wrong' ? '✕' : state === 'missed' ? '?' : ''}</button>;
          }),
        ])}
      </div>
      {checked && <p className={`quizSaid ${ok ? 'ok' : ''}`}>{checked.pct}% right: {checked.right} right, {checked.missed} missing{checked.extra ? `, ${checked.extra} that aren't there` : ''}.
        {ok ? ' You wrote it down by ear!' : ' Dotted boxes are missing, red ones are extra. Listen again and fix them.'}</p>}
      <div className="moves">
        {ok ? <button className="move go" onClick={onDone}><b>✓ Done, next step</b></button> : <button className="move go" onClick={check} disabled={!cells.size}><b>Check it</b></button>}
        <button className="move" onClick={() => play(chart)}><b>🔁 Hear it again</b></button>
        {!ok && tries >= 2 && <button className="move alt" onClick={() => { setCells(new Set(answer)); setChecked(undefined); }}><b>Show me</b></button>}
      </div>
    </div>
  );
}
