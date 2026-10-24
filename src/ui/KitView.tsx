import { useEffect, useRef } from 'react';
import { PAD_INFO, type DrumId, type PadId } from '../engine/kit';
import { emitPad, onHit } from '../input/hits';
import { DRUMS, DRUM_BY_ID, type DrumGfx } from './drums';

const SVGNS = 'http://www.w3.org/2000/svg';
const INK = '#141414';
const FONT = '"Arial Black", Impact, sans-serif';
// Comic sound words popped off a pad on each hit.
const BURST: Record<PadId, string> = { kick: 'BOOM!', snare: 'BAM!', tom1: 'DUM!', tom2: 'DUM!', floor: 'DOOM!', crash: 'KRASH!', ride: 'TING!', hhClosed: 'TSS!', hhOpen: 'TSSSH!', hhPedal: 'CHK!' };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type PadEls = { body: SVGGElement; glow: SVGCircleElement; flash: SVGCircleElement; ripples: SVGGElement; hhTop?: SVGGElement };

function Cymbal({ d, shade = 1 }: { d: DrumGfx; shade?: number }) {
  return (
    <g>
      <circle cx={d.x} cy={d.y} r={d.r} fill="#FFE14D" stroke={INK} strokeWidth={4} opacity={shade} />
      {[1, 2, 3, 4, 5].map(k => (
        <circle key={k} cx={d.x} cy={d.y} r={d.r * (0.25 + k * 0.14)} fill="none" stroke={INK} strokeWidth={1.5} opacity={0.35} />
      ))}
      <circle cx={d.x} cy={d.y} r={d.r * 0.2} fill="#FF9F1C" stroke={INK} strokeWidth={3} />
      <circle cx={d.x} cy={d.y} r={4} fill={INK} />
    </g>
  );
}

function Label({ d }: { d: DrumGfx }) {
  const isCym = d.type === 'cymbal' || d.type === 'hihat';
  const dark = d.type === 'kick';
  const dy = dark ? 40 : isCym ? d.r * 0.5 : d.id === 'snare' ? d.r * 0.58 : 2;
  return (
    <text x={d.x} y={d.y + dy} textAnchor="middle" fontSize={d.r > 90 ? 20 : 15} fontFamily={FONT}
      fill={INK} stroke="#fff" strokeWidth={dark ? 5 : 0} paintOrder="stroke" style={{ pointerEvents: 'none', userSelect: 'none' }}>
      {d.name}
    </text>
  );
}

/** Animated kit. Click a pad to hit it. Animations are imperative (Web Animations API) to keep React out of the hot path. */
export function KitView() {
  const els = useRef({} as Record<DrumId, PadEls>);
  const kickPedal = useRef<SVGRectElement>(null);
  const hhPedal = useRef<SVGRectElement>(null);
  const hhState = useRef<SVGTextElement>(null);
  const thump = useRef<HTMLDivElement>(null);
  const hhOpen = useRef(false);
  const pupil = useRef<SVGGElement>(null);

  function setHiHat(open: boolean) {
    const top = els.current.hihat.hhTop!;
    hhOpen.current = open;
    hhState.current!.textContent = open ? 'open' : 'closed';
    hhState.current!.setAttribute('fill', open ? DRUM_BY_ID.hihat.color : '#fff');
    top.style.transition = 'translate .12s ease-out';
    top.style.translate = open ? '-7px -10px' : '0px 0px';
  }

  function animate(id: DrumId, vel: number, pad: PadId) {
    const d = DRUM_BY_ID[id], p = els.current[id];
    const v = Math.max(0.15, vel / 127);
    p.glow.animate([{ opacity: 0.25 + 0.6 * v }, { opacity: 0 }], { duration: d.type === 'cymbal' ? 900 : 420, easing: 'ease-out' });
    p.flash.animate([{ opacity: 0.12 + 0.5 * v }, { opacity: 0 }], { duration: d.type === 'cymbal' ? 800 : 300, easing: 'ease-out' });
    if (reduceMotion) return;

    if (d.type === 'cymbal' || (d.type === 'hihat' && pad !== 'hhPedal')) {
      const target = d.type === 'hihat' ? p.hhTop! : p.body;
      const dir = Math.random() < 0.5 ? -1 : 1;
      const amt = (d.type === 'hihat' ? 5 : 10) * v;
      target.animate([
        { transform: 'rotate(0deg) scale(1,1)' },
        { transform: `rotate(${dir * amt}deg) scale(${1 - 0.05 * v},${1 - 0.12 * v})` },
        { transform: `rotate(${-dir * amt * 0.5}deg) scale(1,${1 - 0.05 * v})` },
        { transform: `rotate(${dir * amt * 0.2}deg) scale(1,1)` },
        { transform: 'rotate(0deg) scale(1,1)' },
      ], { duration: d.type === 'hihat' ? (pad === 'hhOpen' ? 600 : 260) : 1000 + 400 * v, easing: 'ease-out' });
    } else if (d.type !== 'hihat') {
      p.body.animate([
        { transform: 'scale(1)' }, { transform: `scale(${1 - 0.07 * v})` },
        { transform: `scale(${1 + 0.015 * v})` }, { transform: 'scale(1)' },
      ], { duration: 260, easing: 'cubic-bezier(.2,.8,.25,1)' });
    }

    const ring = document.createElementNS(SVGNS, 'circle');
    Object.entries({ class: 'ripple', cx: d.x, cy: d.y, r: d.r, fill: 'none', stroke: d.color, 'stroke-width': 3 + 3 * v })
      .forEach(([k, val]) => ring.setAttribute(k, String(val)));
    p.ripples.appendChild(ring);
    ring.animate([{ transform: 'scale(1)', opacity: 0.9 }, { transform: `scale(${1.35 + 0.35 * v})`, opacity: 0 }],
      { duration: 650, easing: 'ease-out' }).onfinish = () => ring.remove();

    if (v > 0.6) {
      const n = 6 + Math.round(v * 6);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const dist = d.r * (1.15 + Math.random() * 0.7) - d.r * 0.9;
        const s = document.createElementNS(SVGNS, 'circle');
        Object.entries({ class: 'spark', cx: d.x + Math.cos(a) * d.r * 0.9, cy: d.y + Math.sin(a) * d.r * 0.9, r: 2 + Math.random() * 2.5, fill: d.color })
          .forEach(([k, val]) => s.setAttribute(k, String(val)));
        p.ripples.appendChild(s);
        s.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * dist}px,${Math.sin(a) * dist}px)`, opacity: 0 }],
          { duration: 450 + Math.random() * 300, easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => s.remove();
      }
    }
    const word = document.createElementNS(SVGNS, 'text');
    const wx = d.x + (Math.random() - 0.5) * d.r, wy = d.y - d.r * 0.75;
    Object.entries({ class: 'burst', x: wx, y: wy, 'text-anchor': 'middle', 'font-family': FONT, 'font-size': 22 + 16 * v,
      fill: d.type === 'cymbal' || d.type === 'hihat' ? '#FF5FA2' : '#FFE14D', stroke: INK, 'stroke-width': 5, 'paint-order': 'stroke' })
      .forEach(([k, val]) => word.setAttribute(k, String(val)));
    word.textContent = BURST[pad];
    p.ripples.appendChild(word);
    const tilt = (Math.random() - 0.5) * 24;
    word.animate([
      { transform: `rotate(${tilt}deg) scale(.3)`, opacity: 1 },
      { transform: `rotate(${tilt}deg) scale(1.15) translateY(-6px)`, opacity: 1, offset: 0.25 },
      { transform: `rotate(${tilt}deg) scale(1) translateY(-26px)`, opacity: 0 },
    ], { duration: 650, easing: 'ease-out' }).onfinish = () => word.remove();

    if (id === 'kick') {
      thump.current?.animate([{ opacity: 0.4 + 0.6 * v }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
      kickPedal.current?.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.6)' }, { transform: 'scaleY(1)' }], { duration: 200 });
    }
  }

  // The snare's eye glances toward the pad you just hit.
  function look(id: DrumId) {
    const s = DRUM_BY_ID.snare, d = DRUM_BY_ID[id], dx = d.x - s.x, dy = d.y - s.y, len = Math.hypot(dx, dy) || 1;
    const k = id === 'snare' ? 0 : s.r * 0.22;
    if (pupil.current) pupil.current.style.translate = `${(dx / len) * k}px ${(dy / len) * k * 0.45}px`;
  }

  useEffect(() => onHit(h => {
    if (!h.pad) return;
    const drum = PAD_INFO[h.pad].drum;
    look(drum);
    if (drum === 'hihat') {
      setHiHat(h.pad === 'hhOpen');
      hhPedal.current?.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.6)' }, { transform: 'scaleY(1)' }], { duration: 200 });
    }
    animate(drum, h.velocity, h.pad);
  }), []);

  const reg = (id: DrumId, key: keyof PadEls) => (el: SVGElement | null) => {
    if (el) (els.current[id] ??= {} as PadEls)[key] = el as never;
  };
  const clickPad = (d: DrumGfx) => {
    const pad: PadId = d.id === 'hihat' ? (hhOpen.current ? 'hhOpen' : 'hhClosed') : d.id;
    emitPad(pad, 100);
  };
  const pedalStyle = { transformBox: 'fill-box', transformOrigin: 'center bottom' } as const;

  return (
    <div className="stage">
      <div className="thump" ref={thump} />
      <svg className="kit" viewBox="0 0 1000 640" role="img" aria-label="Drum kit">
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" /></filter>
          <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="7" dy="7" stdDeviation="0" floodColor="#FF5FA2" floodOpacity="1" />
          </filter>
          <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="12" height="12" fill="#FFE14D" /><circle cx="6" cy="6" r="2.6" fill="#E8423F" />
          </pattern>
        </defs>
        <ellipse cx={480} cy={622} rx={400} ry={16} fill="#FF5FA2" opacity={0.3} />
        <g opacity={0.9}>
          <rect x={470} y={588} width={60} height={40} rx={8} fill={INK} stroke="#FFE14D" strokeWidth={3} />
          <rect ref={kickPedal} x={480} y={594} width={40} height={28} rx={5} fill="#2F6FE4" style={pedalStyle} />
          <g className="pad" onPointerDown={e => { e.preventDefault(); emitPad('hhPedal', 100); }}>
            <rect x={120} y={438} width={60} height={40} rx={8} fill={INK} stroke="#FFE14D" strokeWidth={3} />
            <rect ref={hhPedal} x={130} y={444} width={40} height={28} rx={5} fill="#2F6FE4" style={pedalStyle} />
            <text x={150} y={496} textAnchor="middle" fill="#fff" fontSize={12} fontFamily={FONT}>HH pedal</text>
          </g>
        </g>
        {DRUMS.map(d => {
          const isKick = d.type === 'kick';
          const lugs = isKick ? 10 : 8;
          return (
            <g key={d.id} className="pad" onPointerDown={e => { e.preventDefault(); clickPad(d); }}>
              <circle ref={reg(d.id, 'glow')} cx={d.x} cy={d.y} r={d.r * 1.05} fill={d.color} filter="url(#glow)" opacity={0} />
              <g ref={reg(d.id, 'body')} className="body" filter="url(#shadow)">
                {d.type === 'drum' || isKick ? (
                  <>
                    <circle cx={d.x} cy={d.y} r={d.r} fill={d.color} stroke={INK} strokeWidth={4} />
                    {Array.from({ length: lugs }, (_, i) => {
                      const a = (i / lugs) * Math.PI * 2;
                      return <circle key={i} cx={d.x + Math.cos(a) * (d.r - 4)} cy={d.y + Math.sin(a) * (d.r - 4)} r={3.6} fill="#fff" stroke={INK} strokeWidth={1.5} />;
                    })}
                    <circle cx={d.x} cy={d.y} r={d.r * 0.88} fill={isKick ? 'url(#dots)' : '#fff'} stroke={INK} strokeWidth={3} />
                    {d.id === 'snare' && <g pointerEvents="none">{/* the snare is watching */}
                      <ellipse cx={d.x} cy={d.y - 6} rx={d.r * 0.55} ry={d.r * 0.27} fill="#fff" stroke={INK} strokeWidth={3} />
                      <g ref={pupil} style={{ transition: 'translate .18s ease-out' }}>
                        <circle cx={d.x} cy={d.y - 6} r={d.r * 0.19} fill="#2F6FE4" stroke={INK} strokeWidth={2.5} />
                        <circle cx={d.x} cy={d.y - 6} r={d.r * 0.08} fill={INK} />
                        <circle cx={d.x + d.r * 0.06} cy={d.y - 6 - d.r * 0.07} r={d.r * 0.04} fill="#fff" />
                      </g>
                      <ellipse className="lid" cx={d.x} cy={d.y - 6} rx={d.r * 0.57} ry={d.r * 0.29} fill={d.color} stroke={INK} strokeWidth={3} />
                    </g>}
                    <circle ref={reg(d.id, 'flash')} cx={d.x} cy={d.y} r={d.r * 0.88} fill={d.color} opacity={0} />
                    <Label d={d} />
                  </>
                ) : d.type === 'hihat' ? (
                  <>
                    <Cymbal d={d} shade={0.55} />
                    <g ref={reg(d.id, 'hhTop')} className="hhTop">
                      <Cymbal d={d} />
                      <circle ref={reg(d.id, 'flash')} cx={d.x} cy={d.y} r={d.r} fill="#fff6d8" opacity={0} />
                      <Label d={d} />
                    </g>
                  </>
                ) : (
                  <>
                    <Cymbal d={d} />
                    <circle ref={reg(d.id, 'flash')} cx={d.x} cy={d.y} r={d.r} fill="#fff6d8" opacity={0} />
                    <Label d={d} />
                  </>
                )}
              </g>
              {d.type === 'hihat' && <text ref={hhState} x={d.x} y={d.y + d.r + 22} textAnchor="middle" fontSize={12} fill="#fff" fontFamily={FONT}>closed</text>}
              <g ref={reg(d.id, 'ripples')} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
