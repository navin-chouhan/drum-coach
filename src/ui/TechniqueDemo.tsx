import { useEffect, useRef, useState } from 'react';
import { ARM, armPoints, legPoints, PAD_Y, PX_PER_CM, type Pt } from '../engine/demoPose';
import { DEMOS, poseAt, type DemoId } from '../content/demos';

// "How it moves" (R5): the animated diagram of a technique at the lesson's tempo, with the usual mistake one tap away.
// Drawn into an SVG each frame (imperatively: a React render per frame isn't needed).

const NS = 'http://www.w3.org/2000/svg';
const f1 = (v: number) => v.toFixed(1);
const pts = (a: Pt[]) => a.map(p => `${f1(p[0])},${f1(p[1])}`).join(' ');
const tf = (p: Pt, deg: number) => `translate(${f1(p[0])} ${f1(p[1])}) rotate(${deg.toFixed(2)})`;

function draw(root: SVGGElement, id: DemoId, beat: number, wrong: boolean, trail: Pt[], joints: boolean) {
  const el = (tag: string, attrs: Record<string, string | number>, parent: Element = root) => {
    const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); parent.appendChild(e); return e;
  };
  const limb = (g: Element, a: Pt, b: Pt, w: number, color: string) => el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }, g);
  const label = (p: Pt, text: string) => {
    el('circle', { cx: p[0], cy: p[1], r: 6, fill: '#FFE14D', stroke: '#000', 'stroke-width': 2 });
    el('text', { x: p[0] + 9, y: p[1] - 9, fill: '#FFE14D', 'font-size': 13, 'font-weight': 700, 'font-family': 'system-ui' }).textContent = text;
  };
  root.replaceChildren();
  const f = poseAt(id, beat, wrong);
  if (f.leg) {
    const L = legPoints(f.leg), hit = L.beater[0] >= L.headX - 14;
    el('rect', { x: L.H0[0] - 20, y: L.H0[1], width: 260, height: 14, fill: '#333', stroke: '#000', 'stroke-width': 2 });
    el('line', { x1: L.H0[0] + 214, y1: L.H0[1], x2: L.H0[0] + 214, y2: L.H0[1] - 150, stroke: '#555', 'stroke-width': 8 });
    el('rect', { x: L.headX, y: 150, width: 26, height: 300, fill: hit ? '#2DE1C2' : '#3a3a3a', stroke: '#000', 'stroke-width': 2 });
    el('line', { x1: L.pivot[0], y1: L.pivot[1], x2: L.beater[0], y2: L.beater[1], stroke: '#ccc', 'stroke-width': 5 });
    el('circle', { cx: L.beater[0], cy: L.beater[1], r: 14, fill: '#eee', stroke: '#000', 'stroke-width': 2 });
    el('line', { x1: L.toeEnd[0], y1: L.toeEnd[1], x2: L.pivot[0], y2: L.pivot[1] + 20, stroke: '#888', 'stroke-width': 3, 'stroke-dasharray': '6 5' });
    el('line', { x1: L.H0[0], y1: L.H0[1], x2: L.toeEnd[0], y2: L.toeEnd[1], stroke: '#999', 'stroke-width': 12, 'stroke-linecap': 'round' });
    el('rect', { x: 210, y: 262, width: 150, height: 26, rx: 8, fill: '#2a2a2a', stroke: '#000', 'stroke-width': 2 }); // the throne
    limb(root, L.hip, L.knee, 56, '#2F6FE4'); limb(root, L.knee, L.ankle, 42, '#2F6FE4');
    const at = (p: Pt, len: number, deg: number): Pt => [p[0] + len * Math.cos(deg * Math.PI / 180), p[1] + len * Math.sin(deg * Math.PI / 180)];
    el('polygon', { points: pts([L.heel, at(L.heel, 14, L.n), at(L.ankle, 18, L.n), at(at(L.toe, -40, L.fdir), 22, L.n), L.toe, at(L.heel, -4, L.fdir)]), fill: '#1b1b1b', stroke: '#888', 'stroke-width': 2 });
    if (joints) ([[L.hip, 'hip'], [L.knee, 'knee'], [L.ankle, 'ankle'], [L.heel, 'heel'], [L.ball, 'ball']] as [Pt, string][]).forEach(([p, n]) => label(p, n));
    return;
  }
  const arms = f.arms.map(a => ({ ...a, k: armPoints(a.shoulder, a.pose) }));
  const hit = arms.some(a => a.k.tip[1] >= PAD_Y - 3);
  el('rect', { x: 470, y: PAD_Y, width: 230, height: 22, rx: 4, fill: hit ? '#2DE1C2' : '#3a3a3a', stroke: '#000', 'stroke-width': 2 });
  el('rect', { x: 480, y: PAD_Y + 22, width: 210, height: 10, fill: '#222' });
  el('line', { x1: 585, y1: PAD_Y + 32, x2: 585, y2: 510, stroke: '#555', 'stroke-width': 6 });
  const right = arms.find(a => !a.left)!.k;
  trail.push(right.tip); if (trail.length > 70) trail.shift();
  for (const a of arms) {
    const g = el('g', { opacity: a.left ? 0.6 : 1 }), k = a.k;
    if (!a.left) el('polyline', { points: pts(trail), fill: 'none', stroke: '#FFE14D', 'stroke-width': 3, 'stroke-dasharray': '2 6', opacity: 0.8 }, root);
    limb(g, k.S, k.E, 46, a.left ? '#2F6FE4' : '#E8423F'); limb(g, k.E, k.W, 34, '#E9B493'); limb(g, k.E, k.W, 28, '#F2C4A4');
    const hand = el('g', { transform: tf(k.W, k.hand) }, g); // palm, in the hand's frame
    el('path', { d: 'M-8 -16 Q20 -22 44 -14 L54 -6 L54 9 Q34 22 6 19 Q-10 14 -8 -16 Z', fill: '#F2C4A4', stroke: '#5a3b2a', 'stroke-width': 2 }, hand);
    const st = el('g', { transform: tf(k.F, k.stick) }, g); // the stick and the fingers that move with it
    el('path', { d: `M${-ARM.butt} -4 L${ARM.tip} -2.6 L${ARM.tip} 2.6 L${-ARM.butt} 4 Z`, fill: '#D8AD68', stroke: '#000', 'stroke-width': 1.5 }, st);
    el('ellipse', { cx: ARM.tip, cy: 0, rx: 6, ry: 4.5, fill: '#EBC888', stroke: '#000', 'stroke-width': 1.5 }, st);
    for (const [x, len] of [[-16, 17], [-30, 16], [-43, 14]])
      el('path', { d: `M${x + 6} -2 Q${x + 10} ${len} ${x - 2} ${len} Q${x - 9} ${len - 4} ${x - 6} 2`, fill: '#E9B493', stroke: '#5a3b2a', 'stroke-width': 1.6 }, st);
    el('path', { d: 'M4 -2 Q12 14 0 15 Q-9 13 -6 2', fill: '#E9B493', stroke: '#5a3b2a', 'stroke-width': 1.6 }, st); // index, round the fulcrum
    el('path', { d: 'M-34 -9 Q-6 -15 14 -8 Q18 -5 14 -2 L-30 -2 Z', fill: '#F2C4A4', stroke: '#5a3b2a', 'stroke-width': 1.8 }, st); // thumb along the side
    if (joints && !a.left) ([[k.S, 'shoulder'], [k.E, 'elbow'], [k.W, 'wrist'], [k.F, 'fulcrum']] as [Pt, string][]).forEach(([p, n]) => label(p, n));
  }
  // the height ruler and where the tip is now
  const x = 740;
  el('line', { x1: x, y1: PAD_Y, x2: x, y2: PAD_Y - 32 * PX_PER_CM, stroke: '#777', 'stroke-width': 2 });
  for (const cm of [3, 15, 30]) {
    const y = PAD_Y - cm * PX_PER_CM;
    el('line', { x1: x - 8, y1: y, x2: x + 8, y2: y, stroke: '#aaa', 'stroke-width': 2 });
    el('text', { x: x + 14, y: y + 5, fill: '#aaa', 'font-size': 15, 'font-weight': 700, 'font-family': 'system-ui' }).textContent = `${cm} cm`;
  }
  el('line', { x1: x - 14, y1: right.tip[1], x2: x + 14, y2: right.tip[1], stroke: '#FFE14D', 'stroke-width': 4 });
  el('text', { x: x + 14, y: right.tip[1] - 8, fill: '#FFE14D', 'font-size': 17, 'font-weight': 800, 'font-family': 'system-ui' }).textContent = `${Math.round(Math.max(0, (PAD_Y - right.tip[1]) / PX_PER_CM))} cm`;
  if (arms.length > 1) el('text', { x: 40, y: 500, fill: '#9ec5ff', 'font-size': 15, 'font-weight': 700, 'font-family': 'system-ui' }).textContent = 'blue = left hand (behind)';
}

/** The animated technique: right vs wrong, slow motion, the count. `bpm`: the lesson's tempo (the diagram moves at it). */
export function TechniqueDemo({ id, bpm = 70, compact }: { id: DemoId; bpm?: number; compact?: boolean }) {
  const d = DEMOS[id];
  const g = useRef<SVGGElement>(null), wordRef = useRef<HTMLDivElement>(null), countRef = useRef<HTMLDivElement>(null);
  const [wrong, setWrong] = useState(false), [speed, setSpeed] = useState(compact ? 0.5 : 1), [joints, setJoints] = useState(false);
  useEffect(() => {
    if (!('right' in d) && !('leg' in d)) return;
    let beat = 0, last = performance.now(), raf = 0;
    const trail: Pt[] = [];
    const frame = (now: number) => {
      beat += ((now - last) / 60000) * bpm * speed; last = now;
      if (g.current) draw(g.current, id, beat, wrong, trail, joints);
      if (wordRef.current) wordRef.current.textContent = poseAt(id, beat, wrong).word ?? '';
      if (countRef.current && d.counts.length) {
        const k = Math.floor(((beat % d.beats) / d.beats) * d.counts.length);
        countRef.current.innerHTML = d.counts.map((c, i) => `<span class="${i === k ? 'on' : ''}">${c}</span>`).join('');
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [id, bpm, speed, wrong, joints, d]);

  return (
    <div className={`technique ${compact ? 'compact' : ''}`}>
      <div className="techStage">
        {id === 'grip' ? <GripPicture /> : <svg viewBox="0 0 900 520" role="img" aria-label={`${d.title}, animated`}><g ref={g} /></svg>}
        <div className={`techWord ${wrong ? 'wrong' : ''}`} ref={wordRef} aria-live="off" />
        <div className="techCount" ref={countRef} aria-hidden />
      </div>
      {id !== 'grip' && <div className="actions techBar">
        <span className="seg"><button className={wrong ? '' : 'on'} onClick={() => setWrong(false)}>✓ Right</button><button className={wrong ? 'on bad' : ''} onClick={() => setWrong(true)}>✗ Wrong</button></span>
        <span className="seg">{([[1, '1×'], [0.5, '½×'], [0.25, '¼×']] as const).map(([v, l]) => <button key={v} className={speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>{l}</button>)}</span>
        {!compact && <label className="check"><input type="checkbox" checked={joints} onChange={e => setJoints(e.target.checked)} /> Joints</label>}
      </div>}
      {!compact && <>
        <p className="techWhat">{d.what}</p>
        <ul className="techWatch">{d.watch.map(w => <li key={w}>{w}</li>)}</ul>
        <p className="small"><b>✗ Wrong:</b> {d.mistake}</p>
      </>}
    </div>
  );
}

/** Where the stick sits in the hand, from above (a still picture). */
function GripPicture() {
  return (
    <svg viewBox="0 0 640 300" role="img" aria-label="Matched grip seen from above">
      <rect width="640" height="300" fill="#141414" />
      <rect x="40" y="143" width="570" height="14" rx="7" fill="#D8AD68" stroke="#000" strokeWidth="2" />
      <g fill="#E9B493" stroke="#5a3b2a" strokeWidth="2">
        <rect x="96" y="128" width="22" height="58" rx="11" /><rect x="122" y="124" width="24" height="66" rx="12" /><rect x="150" y="122" width="25" height="70" rx="12" />
      </g>
      <path d="M70 110 Q120 80 200 92 L232 118 Q240 150 232 180 L200 206 Q120 222 72 196 Q50 150 70 110 Z" fill="#F2C4A4" stroke="#5a3b2a" strokeWidth="2.5" />
      <path d="M224 120 Q262 112 268 140 Q270 168 246 176 L230 168 Q248 160 246 142 Q240 128 222 132 Z" fill="#E9B493" stroke="#5a3b2a" strokeWidth="2" />
      <path d="M200 92 Q236 78 270 104 Q290 120 282 136 L266 140 Q252 120 228 114 Z" fill="#F2C4A4" stroke="#5a3b2a" strokeWidth="2.5" />
      <g fontFamily="system-ui" fontWeight="700" fontSize="16">
        <line x1="262" y1="150" x2="330" y2="60" stroke="#FFE14D" strokeWidth="2" /><text x="300" y="50" fill="#FFE14D">FULCRUM: thumb + index, a third up</text>
        <line x1="140" y1="190" x2="110" y2="262" stroke="#2DE1C2" strokeWidth="2" /><text x="40" y="284" fill="#2DE1C2">back fingers: wrapped, loose</text>
        <line x1="236" y1="200" x2="330" y2="236" stroke="#fff" strokeWidth="2" /><text x="336" y="242" fill="#fff">small gap: palm and stick</text>
      </g>
    </svg>
  );
}
