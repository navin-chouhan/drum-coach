import { useEffect, useRef } from 'react';
import type { ChartDrum, ChartNote } from '../engine/chart';
import { beatAt, type BeatGrid } from '../engine/tempo';
import { DRUM_BY_ID } from '../ui/drums';
import type { YtPlayer } from './yt';

export const ROWS: ChartDrum[] = ['crash', 'ride', 'hihat', 'hhOpen', 'hhPedal', 'tom1', 'tom2', 'floor', 'snare', 'kick'];
const NAMES: Record<ChartDrum, string> = { crash: 'Crash', ride: 'Ride', hihat: 'Hi-hat', hhOpen: 'HH open', hhPedal: 'HH foot', tom1: 'Tom 1', tom2: 'Tom 2', floor: 'Floor', snare: 'Snare', kick: 'Kick' };
const colorOf = (d: ChartDrum) => DRUM_BY_ID[d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d].color;

/** Lanes × steps editor for bars A–B. Filled = your part, rings = last take, dashed squares = suggested by the song audio, line = playhead. Click toggles a note. */
export function GridEditor({ notes, take, suggestions = [], fromBeat, toBeat, stepsPerBeat, beatsPerBar, yt, grid, onToggle }: {
  notes: ChartNote[]; take: ChartNote[]; suggestions?: ChartNote[]; fromBeat: number; toBeat: number; stepsPerBeat: number; beatsPerBar: number;
  yt: YtPlayer; grid: BeatGrid; onToggle: (t: number, drum: ChartDrum) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cols = Math.round((toBeat - fromBeat) * stepsPerBeat);
  const LABEL = 64, ROW_H = 22;

  useEffect(() => {
    const cv = ref.current!, c = cv.getContext('2d')!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = ROWS.length * ROW_H;
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      const cw = (W - LABEL) / cols;
      ROWS.forEach((d, r) => {
        if (r % 2 === 0) { c.fillStyle = 'rgba(255,255,255,.03)'; c.fillRect(0, r * ROW_H, W, ROW_H); }
        c.fillStyle = '#E6E6E6'; c.font = '11px system-ui'; c.textBaseline = 'middle'; c.textAlign = 'left';
        c.fillText(NAMES[d], 6, r * ROW_H + ROW_H / 2);
      });
      for (let i = 0; i <= cols; i++) {
        const beat = i / stepsPerBeat, bar = Math.abs(((fromBeat + beat) / beatsPerBar) % 1) < 1e-6, onBeat = i % stepsPerBeat === 0;
        c.strokeStyle = bar ? 'rgba(255,225,77,.5)' : onBeat ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.06)';
        c.beginPath(); c.moveTo(LABEL + i * cw + 0.5, 0); c.lineTo(LABEL + i * cw + 0.5, H); c.stroke();
      }
      const x = (t: number) => LABEL + (t - fromBeat) * stepsPerBeat * cw + cw / 2;
      for (const n of take) {
        if (n.t < fromBeat || n.t >= toBeat) continue;
        c.strokeStyle = colorOf(n.drum); c.lineWidth = 2;
        c.beginPath(); c.arc(x(n.t), ROWS.indexOf(n.drum) * ROW_H + ROW_H / 2, 7, 0, Math.PI * 2); c.stroke();
      }
      c.setLineDash([3, 3]);
      for (const n of suggestions) { // suggested by listening to the song: dashed squares
        if (n.t < fromBeat || n.t >= toBeat) continue;
        c.strokeStyle = colorOf(n.drum); c.lineWidth = 1.5;
        c.strokeRect(x(n.t) - 8, ROWS.indexOf(n.drum) * ROW_H + ROW_H / 2 - 8, 16, 16);
      }
      c.setLineDash([]);
      for (const n of notes) {
        if (n.t < fromBeat || n.t >= toBeat) continue;
        c.fillStyle = colorOf(n.drum); c.globalAlpha = n.ghost ? 0.5 : 1;
        c.beginPath(); c.arc(x(n.t), ROWS.indexOf(n.drum) * ROW_H + ROW_H / 2, n.accent ? 6.5 : 5, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
      }
      const b = beatAt(yt.songTime(), grid);
      if (b >= fromBeat && b < toBeat) {
        const px = LABEL + (b - fromBeat) * stepsPerBeat * cw;
        c.strokeStyle = '#FFE14D'; c.lineWidth = 2; c.beginPath(); c.moveTo(px, 0); c.lineTo(px, H); c.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [notes, take, suggestions, fromBeat, toBeat, stepsPerBeat, beatsPerBar, cols, yt, grid]);

  return (
    <div className="gridEditor">
      <canvas ref={ref} style={{ height: ROWS.length * ROW_H }} aria-label="Drum part editor: click a cell to add or remove a note"
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect();
          const col = Math.floor(((e.clientX - r.left - LABEL) / (r.width - LABEL)) * cols), row = Math.floor((e.clientY - r.top) / ROW_H);
          if (col >= 0 && col < cols && ROWS[row]) onToggle(fromBeat + col / stepsPerBeat, ROWS[row]);
        }} />
    </div>
  );
}
