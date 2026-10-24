import { useEffect, useRef } from 'react';
import type { DrumId } from '../engine/kit';
import { DRUM_BY_ID } from '../ui/drums';
import { player, position } from './player';

// Kit order, left to right as you sit at it; kick last.
export const HIGHWAY_LANES: DrumId[] = ['hihat', 'crash', 'snare', 'tom1', 'tom2', 'floor', 'ride', 'kick'];
const KEYS: Record<DrumId, string> = { hihat: 'A/Q Z', crash: 'W', snare: 'S', tom1: 'E', tom2: 'R', floor: 'F', ride: 'T', kick: 'Space' };
const laneOf = (d: string) => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d) as DrumId;
const JCOLOR = { perfect: '#34d399', good: '#fbbf24', miss: '#f87171', extra: '#f87171' };
const PX_PER_MS = 0.32;

/** Falling-notes highway; reads the mutable player state every frame. */
export function Highway() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current!, c = cv.getContext('2d')!;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize); ro.observe(cv);
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const W = cv.clientWidth, H = cv.clientHeight, now = performance.now();
      const laneW = W / HIGHWAY_LANES.length, hitY = H - 64;
      c.clearRect(0, 0, W, H);
      const active = player.phase !== 'idle' && player.options?.activeLanes && !player.options.demo
        ? new Set(player.options.activeLanes.map(laneOf)) : null;
      HIGHWAY_LANES.forEach((id, i) => {
        if (i % 2 === 0) { c.fillStyle = 'rgba(255,255,255,.025)'; c.fillRect(i * laneW, 0, laneW, H); }
        if (active?.has(id)) { c.fillStyle = 'rgba(255,181,71,.06)'; c.fillRect(i * laneW, 0, laneW, H); }
        c.fillStyle = active && !active.has(id) ? '#4b5263' : '#8a94a7'; c.font = '12px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(DRUM_BY_ID[id].name, i * laneW + laneW / 2, H - 34);
        c.fillStyle = '#5c6578'; c.font = '10px ui-monospace, monospace';
        c.fillText(KEYS[id], i * laneW + laneW / 2, H - 16);
      });
      const run = player.run;
      if (!run || player.phase === 'idle') {
        c.strokeStyle = 'rgba(255,181,71,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, hitY); c.lineTo(W, hitY); c.stroke();
        return;
      }
      const pos = position(now), pxPerBeat = player.beatMs * PX_PER_MS;
      const yOf = (t: number) => hitY - (t - pos) * pxPerBeat;

      // beat and bar lines
      for (let b = Math.ceil(pos - 1); b <= pos + H / pxPerBeat; b++) {
        if (b < 0 || b > run.beats) continue;
        const bar = Math.abs(b / run.beatsPerBar - Math.round(b / run.beatsPerBar)) < 1e-6;
        c.strokeStyle = bar ? 'rgba(255,181,71,.35)' : 'rgba(255,255,255,.08)'; c.lineWidth = bar ? 2 : 1;
        c.beginPath(); c.moveTo(0, yOf(b)); c.lineTo(W, yOf(b)); c.stroke();
      }
      // hit line + lane flashes
      c.strokeStyle = 'rgba(255,181,71,.9)'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, hitY); c.lineTo(W, hitY); c.stroke();
      for (const f of player.feedback) {
        const age = now - f.time, lane = HIGHWAY_LANES.indexOf(f.lane as DrumId);
        if (age < 0 || age > 450 || lane < 0) continue;
        const a = 1 - age / 450;
        c.globalAlpha = a * 0.35; c.fillStyle = JCOLOR[f.judgement];
        c.fillRect(lane * laneW + 2, hitY - 40, laneW - 4, 40);
        c.globalAlpha = a; c.font = 'bold 13px system-ui, sans-serif';
        c.fillText(f.judgement === 'extra' ? '✕' : f.judgement[0].toUpperCase() + f.judgement.slice(1), lane * laneW + laneW / 2, hitY - 54 - (1 - a) * 16);
        c.globalAlpha = 1;
      }
      // notes
      for (let i = 0; i < run.notes.length; i++) {
        const n = run.notes[i], y = yOf(n.t);
        if (y > H + 20) continue;
        if (y < -20) break;
        const r = player.results[i], auto = player.auto[i];
        if (r.judgement !== 'miss') continue; // played
        if (auto && n.t < pos) continue; // the app played it
        const late = !auto && (pos - n.t) * player.beatMs > 60 && !player.options?.wait;
        const lane = HIGHWAY_LANES.indexOf(laneOf(n.drum)), x = lane * laneW + laneW / 2;
        const color = late ? '#4b5263' : DRUM_BY_ID[laneOf(n.drum)].color;
        const w = (laneW - 14) * (n.ghost ? 0.6 : 1), h = n.accent ? 18 : n.ghost ? 9 : 13;
        c.globalAlpha = (n.ghost ? 0.6 : 1) * (auto ? 0.3 : 1); c.fillStyle = color;
        if (n.drum === 'hhOpen') { // open hi-hat: ring
          c.strokeStyle = color; c.lineWidth = 4; c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2); c.stroke();
        } else if (n.drum === 'hhPedal') { // foot: small bar
          c.fillRect(x - w / 4, y - 4, w / 2, 8);
        } else {
          c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, 5); c.fill();
          if (n.accent) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
        }
        c.globalAlpha = 1;
      }
      // count-in and progress
      if (pos < 0) {
        c.fillStyle = '#e9edf4'; c.font = 'bold 72px system-ui, sans-serif';
        c.fillText(String(Math.ceil(-pos)), W / 2, H / 2 - 40);
      } else if (player.options?.count && pos < run.beats) { // count out loud: 1 & 2 & …
        const beat = Math.floor(pos % run.beatsPerBar) + 1;
        c.fillStyle = 'rgba(233,237,244,.35)'; c.font = 'bold 64px system-ui, sans-serif';
        c.fillText(pos % 1 < 0.5 ? String(beat) : '&', W / 2, 70);
      }
      c.fillStyle = '#ffb547'; c.fillRect(0, 0, (W * Math.max(0, Math.min(1, pos / run.beats))), 3);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={canvas} className="highway" aria-label="Note highway" />;
}
