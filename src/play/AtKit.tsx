import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Thinking } from '../coach/api';
import { recentAccuracy } from '../engine/scoring';
import type { ChartDrum } from '../engine/chart';
import type { PadId } from '../engine/kit';
import { onHit } from '../input/hits';
import { player, playerVersion, position, subscribePlayer } from './player';

// Building blocks of the screens you use at the kit (lessons, Practice): read from 1–2 m, driven by pad gestures
// (engine/padCommands.ts). Each move shows its gesture, so you learn them by looking.

/** The coach's one line, big. While the coach thinks, the verdict stays and a small line under it says so. */
export function CoachLine({ line, under, thinking }: { line: string; under?: string; thinking?: boolean }) {
  return (
    <div className="say">
      <div className="avatar" aria-hidden>🥁</div>
      <div className="bubble" aria-live="polite">{line}{under && <p className="under">{under}</p>}{thinking && <Thinking what="Your coach is listening back" />}</div>
    </div>
  );
}

/** A move tile. `go` is the main move: hi-hat pedal × 3, crash × 2 or a spoken "yes". `sub`: a small line instead of a gesture. */
export function Move({ label, gesture, sub, go, alt, dark, onClick }: { label: string; gesture?: string; sub?: string; go?: boolean; alt?: boolean; dark?: boolean; onClick: () => void }) {
  return (
    <button className={`move ${go ? 'go' : dark ? 'dark' : alt ? 'alt' : ''}`} autoFocus={go} onClick={onClick}>
      <b>{label}</b>
      <span className={`g ${sub ? 'small' : ''}`}>{go ? <><i>hi-hat pedal × 3</i> or <i>crash × 2</i> or say "yes"</> : gesture ? <i>{gesture}</i> : sub}</span>
    </button>
  );
}

/** The clock, re-read every `ms` (in state: a render that read it itself would show a different time each re-render). */
function useNow(ms: number) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => { const t = setInterval(() => setNow(performance.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** While you play: the live tip, big enough to read from the throne. */
export function LiveHint() {
  useSyncExternalStore(subscribePlayer, playerVersion);
  const now = useNow(500);
  const c = player.cue, show = c && now - c.at < 3000;
  return <div className={`liveHint ${show ? 'on' : ''}`} role="status">{show ? `💡 ${c.cue.text}` : ' '}</div>;
}

/** Flow mode's live line: how many of the notes in the last 4 bars landed. */
export function FlowMeter() {
  const now = useNow(500);
  const run = player.run, pos = position(), bpb = run?.beatsPerBar ?? 4;
  const mine = run ? run.notes.flatMap((_, i) => (player.auto[i] ? [] : [i])) : []; // your notes, not the app's
  const pct = run && pos > bpb ? recentAccuracy(mine.map(i => player.results[i]), { ...run, notes: mine.map(i => run.notes[i]) }, Math.max(0, pos - 4 * bpb), pos - 0.5) : null;
  const left = player.options?.seconds ? Math.max(0, Math.ceil(player.options.seconds - (now - player.zero) / 1000)) : undefined;
  return <div className="liveHint on">{left !== undefined ? `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left · ` : '🌊 '}{Math.max(0, Math.floor(pos / bpb))} bars{left === undefined ? ' in the flow' : ''}{pct !== null ? ` · last 4 bars: ${pct}% landed` : ''}</div>;
}

/** The tempo and its ladder: one rung per 5 BPM from the start (dashed) to the goal (black); the rung you're on is yellow. */
export function TempoLadder({ bpm, start, target }: { bpm: number; start: number; target: number }) {
  const lo = Math.min(bpm, start), n = Math.floor((target - lo) / 5) + 1, every = Math.ceil(n / 12); // at most 12 rungs
  const rungs = Array.from({ length: Math.ceil(n / every) }, (_, k) => lo + k * every * 5);
  if (rungs[rungs.length - 1] < target) rungs.push(target);
  const at = [...rungs].reverse().find(b => b <= bpm);
  return (
    <span className="ladder" title={`From ${start} to ${target} BPM, 5 at a time`}>
      <span className="rungs">{rungs.map((b, k) => <i key={b} style={{ '--k': k * (6 / Math.max(1, rungs.length - 1)) } as React.CSSProperties}
        className={`${b === at ? 'at' : ''} ${b === start ? 'start' : ''} ${b === target ? 'goal' : ''}`} title={`${b} BPM`} />)}</span>
      <span>start {start} · goal {target}</span>
    </span>
  );
}

// Where each pad sits on the mini kit (seen from the throne), and which pads and chart lanes light it.
const MINI: { id: string; pads: PadId[]; lanes: ChartDrum[]; x: number; y: number; r: number }[] = [
  { id: 'hihat', pads: ['hhClosed', 'hhOpen', 'hhPedal'], lanes: ['hihat', 'hhOpen', 'hhPedal'], x: 28, y: 46, r: 17 },
  { id: 'crash', pads: ['crash'], lanes: ['crash'], x: 58, y: 20, r: 16 },
  { id: 'tom1', pads: ['tom1'], lanes: ['tom1'], x: 92, y: 30, r: 12 },
  { id: 'tom2', pads: ['tom2'], lanes: ['tom2'], x: 124, y: 30, r: 12 },
  { id: 'ride', pads: ['ride'], lanes: ['ride'], x: 164, y: 22, r: 18 },
  { id: 'floor', pads: ['floor'], lanes: ['floor'], x: 150, y: 70, r: 17 },
  { id: 'snare', pads: ['snare'], lanes: ['snare'], x: 62, y: 72, r: 17 },
];
const LANE_WORDS: Record<string, string> = { hihat: 'hi-hat', hhOpen: 'open hi-hat', hhPedal: 'hi-hat foot', tom1: 'tom 1', tom2: 'tom 2', floor: 'floor tom' };
export const laneWord = (d: string) => LANE_WORDS[d] ?? d;

/** A small kit: your pads in yellow, each lights up as you hit it (so you see the hit land without looking at the kit). */
export function MiniKit({ mine }: { mine: readonly ChartDrum[] }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => onHit(h => {
    const id = h.pad === 'kick' ? 'kick' : MINI.find(m => h.pad && m.pads.includes(h.pad))?.id, el = id && svg.current?.querySelector(`[data-pad="${id}"]`);
    if (!el) return;
    el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 140);
  }), []);
  return (
    <svg ref={svg} className="miniKit" viewBox="0 0 200 112" role="img" aria-label={`Your pads: ${mine.map(laneWord).join(', ')}`}>
      {MINI.map(m => <circle key={m.id} data-pad={m.id} className={m.lanes.some(l => mine.includes(l)) ? 'mine' : ''} cx={m.x} cy={m.y} r={m.r} />)}
      <rect data-pad="kick" className={mine.includes('kick') ? 'mine' : ''} x={92} y={84} width={34} height={20} rx={4} />
    </svg>
  );
}

/** Under the music: the take's goal (boxes to tick, in words), your pads on a mini kit, and while you play the bar and Stop. */
export function GoalBar({ boxes, kit, children, right }: { boxes?: { n: number; ok: number }; kit: readonly ChartDrum[]; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="goalBar">
      {boxes && boxes.n > 0 && <span className="boxes" role="img" aria-label={`${boxes.ok} of ${boxes.n} clean takes`}>{Array.from({ length: boxes.n }, (_, k) => <i key={k} className={k < boxes.ok ? 'ok' : ''}>{k < boxes.ok ? '✓' : ''}</i>)}</span>}
      <span className="txt">{children}</span>
      <span className="kitLbl"><MiniKit mine={kit} /><span>your pad{kit.length === 1 ? '' : 's'}:<br />{kit.map(laneWord).join(', ')}</span></span>
      {right}
    </div>
  );
}

/** While you play: which bar of the take you're in. */
export function BarCounter() {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 200); return () => clearInterval(t); }, []);
  const run = player.run, pos = position();
  if (!run || pos < 0) return <>Get ready…</>;
  const bars = Math.ceil(run.beats / run.beatsPerBar - 1e-6);
  return <>Bar <b>{Math.min(bars, Math.floor(pos / run.beatsPerBar) + 1)}</b> of {bars}</>;
}

/**
 * After a take: where every hit landed against the click (one dot per hit, early to the left, late to the right),
 * with the "right on it" zone. A steady lean to one side is the pattern to see (latency, or waiting for the click).
 */
export function TimingLine({ offsets, zone, missed, extra }: { offsets: number[]; zone: number; missed: number; extra: number }) {
  if (!offsets.length) return null;
  const range = Math.max(150, Math.ceil(Math.max(...offsets.map(Math.abs)) / 50) * 50), x = (ms: number) => 500 + (ms * 420) / range;
  const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
  const tone = (ms: number) => (Math.abs(ms) <= zone ? '#1E9E5A' : '#C77700');
  return (
    <figure className="timingLine">
      <figcaption><b>Where your hits landed</b> · {offsets.length} hit{offsets.length === 1 ? '' : 's'}{missed ? `, ${missed} missed` : ''}{extra ? `, ${extra} extra` : ''} ·
        on average {Math.abs(mean) < 10 ? 'right on the click' : `${Math.round(Math.abs(mean))} ms ${mean > 0 ? 'after' : 'before'} the click`}</figcaption>
      <svg viewBox="0 0 1000 96" role="img" aria-label={`Your hits against the click: on average ${Math.round(mean)} ms`}>
        <rect x={x(-zone)} y={20} width={x(zone) - x(-zone)} height={44} fill="#1E9E5A22" stroke="#1E9E5A" strokeWidth={2} />
        <text x={500} y={14} textAnchor="middle" fontSize={13} fontWeight={700} fill="#1E9E5A">right on it</text>
        <line x1={x(-range)} x2={x(range)} y1={42} y2={42} stroke="#141414" strokeWidth={3} />
        <line x1={500} x2={500} y1={18} y2={66} stroke="#141414" strokeWidth={3} />
        <text x={500} y={86} textAnchor="middle" fontSize={14} fontWeight={800}>the click</text>
        <text x={x(-range)} y={86} fontSize={14} fontWeight={700} fill="#555">← early</text>
        <text x={x(range)} y={86} textAnchor="end" fontSize={14} fontWeight={700} fill="#555">late →</text>
        {offsets.map((ms, k) => <circle key={k} cx={x(ms)} cy={42 + ((k % 3) - 1) * 9} r={7} fill={tone(ms)} stroke="#141414" strokeWidth={1.5}>
          <title>{Math.abs(ms) <= zone ? 'on it' : `${Math.round(Math.abs(ms))} ms ${ms > 0 ? 'late' : 'early'}`}</title></circle>)}
      </svg>
    </figure>
  );
}
