import { useEffect, useRef } from 'react';
import { PAD_INFO } from '../engine/kit';
import { onHit } from '../input/hits';
import { DRUM_BY_ID, LANE_ORDER } from './drums';

const WINDOW = 4000, LABEL_W = 82;

/** Scrolling hit timeline (last 4 s), one lane per drum. Ported from the prototype. */
export function Timeline() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current!;
    const c = cv.getContext('2d')!;
    const hits: { lane: number; t: number; v: number; color: string }[] = [];
    const off = onHit(h => {
      if (!h.pad) return;
      const drum = PAD_INFO[h.pad].drum;
      hits.push({ lane: LANE_ORDER.indexOf(drum), t: h.time, v: h.velocity / 127, color: DRUM_BY_ID[drum].color });
      if (hits.length > 400) hits.splice(0, hits.length - 400);
    });
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    window.addEventListener('resize', resize); resize();

    let raf = 0;
    const draw = () => {
      const W = cv.clientWidth, H = cv.clientHeight, now = performance.now();
      const laneH = H / LANE_ORDER.length;
      const xOf = (t: number) => W - 14 - ((now - t) / WINDOW) * (W - 14 - LABEL_W);
      c.clearRect(0, 0, W, H);
      LANE_ORDER.forEach((id, i) => {
        const y = i * laneH;
        if (i % 2 === 0) { c.fillStyle = 'rgba(255,255,255,.018)'; c.fillRect(0, y, W, laneH); }
        c.fillStyle = DRUM_BY_ID[id].color; c.fillRect(10, y + laneH / 2 - 4, 8, 8);
        c.fillStyle = '#C9D8E8'; c.font = '11px system-ui, sans-serif'; c.textBaseline = 'middle';
        c.fillText(DRUM_BY_ID[id].name, 24, y + laneH / 2);
      });
      c.strokeStyle = 'rgba(242,213,122,.8)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(W - 14, 0); c.lineTo(W - 14, H); c.stroke();
      for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i], age = now - h.t;
        if (age > WINDOW) break;
        const x = xOf(h.t), y = h.lane * laneH + laneH / 2;
        if (x < LABEL_W) continue;
        const fresh = Math.max(0, 1 - age / 220);
        c.globalAlpha = 0.35 + 0.65 * (1 - age / WINDOW);
        if (fresh > 0) { c.shadowColor = h.color; c.shadowBlur = 18 * fresh; }
        c.fillStyle = h.color;
        c.beginPath(); c.arc(x, y, 3.5 + h.v * 6.5 + fresh * 5, 0, Math.PI * 2); c.fill();
        c.shadowBlur = 0;
      }
      c.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { off(); cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <footer>
      <div className="lanesHead"><span>Timeline · last 4 seconds</span><span>now →</span></div>
      <canvas ref={canvas} className="lanes" />
    </footer>
  );
}
