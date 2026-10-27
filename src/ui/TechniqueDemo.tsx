import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings } from '../input/settings';
import { mirrorHands } from '../engine/padCal';
import { ARM, armPoints, PAD_Y, PX_PER_CM, type Pt } from '../engine/demoPose';
import { drawGripAbove, drawGripSide, drawKick, ensureArtDefs, GRIP_VIEWBOX, KICK_TEXT, KICK_VIEWBOX, type HitState, type KickMode } from './demoArt';
import { DEMOS, poseAt, type DemoId } from '../content/demos';
import { say } from '../voice/voice';
import { player } from '../play/player';

// "How it moves" (R5): the animated diagram of a technique at the lesson's tempo, with the usual mistake one tap away.
// Drawn into an SVG each frame (imperatively: a React render per frame isn't needed).

const NS = 'http://www.w3.org/2000/svg';
const f1 = (v: number) => v.toFixed(1);
const pts = (a: Pt[]) => a.map(p => `${f1(p[0])},${f1(p[1])}`).join(' ');
const tf = (p: Pt, deg: number) => `translate(${f1(p[0])} ${f1(p[1])}) rotate(${deg.toFixed(2)})`;

function draw(root: SVGGElement, id: DemoId, beat: number, wrong: boolean, trail: Pt[], joints: boolean, mirror = false) {
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
  // the live height sits right of the fixed marks' labels, so "29 cm" never lands on "30 cm" (D9)
  el('text', { x: x + 72, y: right.tip[1] + 6, fill: '#FFE14D', 'font-size': 17, 'font-weight': 800, 'font-family': 'system-ui' }).textContent = `${Math.round(Math.max(0, (PAD_Y - right.tip[1]) / PX_PER_CM))} cm`;
  if (arms.length > 1) el('text', { x: 40, y: 500, fill: '#9ec5ff', 'font-size': 15, 'font-weight': 700, 'font-family': 'system-ui' }).textContent = `blue = ${mirror ? 'right' : 'left'} hand (behind)`;
  // left-handed: the drawing is mirrored by its group; the words are flipped back so they read normally
  if (mirror) root.querySelectorAll('text').forEach(t => { const x = Number(t.getAttribute('x')); t.setAttribute('transform', `translate(${2 * x} 0) scale(-1 1)`); t.setAttribute('text-anchor', 'end'); });
}

const ART = { grip: true, kick: true } as Partial<Record<DemoId, true>>; // D10 v2 close-ups (demoArt.ts); the rest are the arm drawing above
const flipTexts = (root: Element) => root.querySelectorAll('text').forEach(t => { // a mirrored drawing's words, read the normal way
  const x = Number(t.getAttribute('x')), a = t.getAttribute('text-anchor');
  t.setAttribute('transform', `translate(${2 * x} 0) scale(-1 1)`); t.setAttribute('text-anchor', a === 'end' ? 'start' : a === 'middle' ? 'middle' : 'end');
});

/**
 * The animated technique: right vs wrong, slow motion, the count. `bpm`: the lesson's tempo (the diagram moves at it).
 * The grip is shown from the thumb side and from above (both in the full view, a switch in the small one); the kick
 * heel down or heel up (`heelUp`: the lesson's stage plays heel up).
 */
export function TechniqueDemo({ id, bpm = 70, compact, heelUp }: { id: DemoId; bpm?: number; compact?: boolean; heelUp?: boolean }) {
  const d = DEMOS[id];
  const g = useRef<SVGGElement>(null), g2 = useRef<SVGGElement>(null);
  const wordRef = useRef<HTMLDivElement>(null), countRef = useRef<HTMLDivElement>(null), word2 = useRef<HTMLDivElement>(null), count2 = useRef<HTMLDivElement>(null);
  const [wrong, setWrong] = useState(false), [speed, setSpeed] = useState(compact ? 0.5 : 1), [joints, setJoints] = useState(!compact && !!ART[id]); // labels on the close-ups; joint names on the arm when asked
  const [view, setView] = useState<'side' | 'above'>('side'), [mode, setMode] = useState<KickMode>(heelUp ? 'up' : 'down');
  const mirror = !!useSyncExternalStore(subscribeSettings, getSettings).leftHanded; // N9: drawn for a left-handed player
  const art = !!ART[id], both = art && id === 'grip' && !compact; // the full view shows the grip from both sides at once
  const kickText = id === 'kick' ? KICK_TEXT[mode] : undefined;
  // D15: the coach talks you through it: the description (or the mistake), then the cue words in time for two loops.
  // On by default in the full view, one tap in the lesson's small panel; never during a take or with the voice off.
  const [talk, setTalk] = useState(!compact);
  const canTalk = () => talk && getSettings().voice !== false && player.phase !== 'playing';
  useEffect(() => { if (canTalk()) void say(wrong ? `The mistake: ${d.mistake}` : kickText?.what ?? d.what, true); }, [id, wrong, talk, mode]); // eslint-disable-line react-hooks/exhaustive-deps -- once per demo, side or switch
  useEffect(() => {
    if (!art && !('right' in d) && !('leg' in d)) return;
    if (art) ensureArtDefs();
    let beat = 0, last = performance.now(), raf = 0, said: string | undefined;
    const trail: Pt[] = [], st: HitState = {}, st2: HitState = {};
    const counts = (el: HTMLDivElement | null, cs: string[]) => {
      if (!el || !cs.length) return;
      const k = Math.floor(((beat % d.beats) / d.beats) * cs.length);
      el.replaceChildren(...cs.map((c, i) => Object.assign(document.createElement('span'), { className: i === k ? 'on' : '', textContent: mirror ? mirrorHands(c) : c })));
    };
    const frame = (now: number) => {
      beat += ((now - last) / 60000) * bpm * speed; last = now;
      let word: string | undefined;
      if (art && g.current) {
        g.current.replaceChildren();
        if (id === 'kick') word = drawKick(g.current, beat, mode, wrong, joints, now, st);
        else word = (view === 'above' && !both ? drawGripAbove : drawGripSide)(g.current, beat, wrong, joints, now, st);
        if (mirror) flipTexts(g.current);
        if (both && g2.current) {
          g2.current.replaceChildren();
          const w2 = drawGripAbove(g2.current, beat, wrong, joints, now, st2);
          if (mirror) flipTexts(g2.current);
          if (word2.current) { word2.current.textContent = w2 ?? word ?? ''; }
          counts(count2.current, ['R', 'L', 'R', 'L']);
        }
      } else {
        if (g.current) draw(g.current, id, beat, wrong, trail, joints, mirror);
        word = poseAt(id, beat, wrong).word;
      }
      if (wordRef.current) wordRef.current.textContent = word ?? '';
      if (word && word !== said && beat < 2 * d.beats && canTalk()) void say(word.toLowerCase()); // skipped while the intro still talks
      said = word;
      counts(countRef.current, id === 'grip' && view === 'above' && !both ? ['R', 'L', 'R', 'L'] : d.counts);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [id, bpm, speed, wrong, joints, d, mirror, talk, view, mode, art, both]); // eslint-disable-line react-hooks/exhaustive-deps -- canTalk reads live settings

  const box = id === 'kick' ? KICK_VIEWBOX : art ? GRIP_VIEWBOX : '0 0 900 520';
  const stage = { box, mirror, wrong, label: d.title };
  return (
    <div className={`technique ${compact ? 'compact' : ''}`}>
      {both ? <div className="techPair"><Stage {...stage} g={g} word={wordRef} count={countRef} name="From the side" /><Stage {...stage} g={g2} word={word2} count={count2} name="From above" /></div>
        : <Stage {...stage} g={g} word={wordRef} count={countRef} name={id === 'grip' ? (view === 'side' ? 'From the side' : 'From above') : id === 'kick' ? (mode === 'down' ? 'Heel down' : 'Heel up') : undefined} />}
      <div className="actions techBar">
        <span className="seg"><button className={wrong ? '' : 'on'} onClick={() => setWrong(false)}>✓ Right</button><button className={wrong ? 'on bad' : ''} onClick={() => setWrong(true)}>✗ Wrong</button></span>
        {id === 'grip' && !both && <span className="seg"><button className={view === 'side' ? 'on' : ''} onClick={() => setView('side')}>Side</button><button className={view === 'above' ? 'on' : ''} onClick={() => setView('above')}>Above</button></span>}
        {id === 'kick' && <span className="seg"><button className={mode === 'down' ? 'on' : ''} onClick={() => setMode('down')}>Heel down</button><button className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Heel up</button></span>}
        <span className="seg">{([[1, '1×'], [0.5, '½×'], [0.25, '¼×']] as const).map(([v, l]) => <button key={v} className={speed === v ? 'on' : ''} onClick={() => setSpeed(v)}>{l}</button>)}</span>
        {!compact && <label className="check"><input type="checkbox" checked={joints} onChange={e => setJoints(e.target.checked)} /> {art ? 'Labels' : 'Joints'}</label>}
        <button className={talk ? 'on' : ''} aria-pressed={talk} onClick={() => setTalk(!talk)}>{talk ? '🔊 Talking you through it' : '🔈 Talk me through it'}</button>
      </div>
      {!compact && <>
        {kickText && <h4 className="techTitle">{kickText.title}</h4>}
        <p className="techWhat">{kickText?.what ?? d.what}</p>
        <ul className="techWatch">{(kickText?.watch ?? d.watch).map(w => <li key={w}>{w}</li>)}</ul>
        <p className="small"><b>✗ Wrong:</b> {d.mistake}</p>
      </>}
    </div>
  );
}


/** One drawing: the SVG the frame loop draws into (mirrored for a left-handed player), the cue word, the count, which view. */
function Stage({ box, mirror, wrong, label, g, word, count, name }: { box: string; mirror: boolean; wrong: boolean; label: string; name?: string;
  g: React.RefObject<SVGGElement | null>; word: React.RefObject<HTMLDivElement | null>; count: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="techStage">
      <svg viewBox={box} role="img" aria-label={`${label}${name ? `, ${name.toLowerCase()}` : ''}, animated`}><g transform={mirror ? `translate(${box.split(' ')[2]} 0) scale(-1 1)` : undefined}><g ref={g} /></g></svg>
      <div className={`techWord ${wrong ? 'wrong' : ''}`} ref={word} aria-live="off" />
      <div className="techCount" ref={count} aria-hidden />
      {name && <div className="techView">{name}</div>}
    </div>
  );
}
