'use dom';
// "How it moves" (R5) as an Expo DOM component: the web's src/ui/TechniqueDemo.tsx, copied (the drawing is SVG built
// each frame with createElementNS, so it runs unchanged inside the WebView), with the web's CSS as inline styles.
// What differs: the settings arrive as props (left-handed, voice, playing) and the coach's voice is a native action.
// Text is set with textContent / React. No HTML strings. Keep in step with the web file.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DOMProps } from 'expo/dom';
import { DEMOS, poseAt, type DemoId } from '@drum-coach/core/content/demos';
import { ARM, armPoints, PAD_Y, PX_PER_CM, type Pt } from '@drum-coach/core/engine/demoPose';
import { mirrorHands } from '@drum-coach/core/engine/padCal';
import { drawGripAbove, drawGripSide, drawKick, ensureArtDefs, GRIP_VIEWBOX, KICK_TEXT, KICK_VIEWBOX, type HitState, type KickMode } from './demoArt';

export type TechniqueDomProps = {
  id: DemoId;
  bpm?: number;
  /** The lesson's small panel (and the intro's 4th slide): half speed, no words under it, talking off. */
  compact?: boolean;
  /** The kick heel up (the lesson's stage plays heel up). */
  heelUp?: boolean;
  /** N9: drawn for a left-handed player. */
  mirror?: boolean;
  /** settings.voice !== false and no take running: the coach may talk you through it. */
  canSpeak?: boolean;
  /** Native action: the coach says it (now = cut off what's being said). */
  say?: (text: string, now: boolean) => Promise<void> | void;
  dom?: DOMProps;
};

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
  el('text', { x: x + 72, y: right.tip[1] + 6, fill: '#FFE14D', 'font-size': 17, 'font-weight': 800, 'font-family': 'system-ui' }).textContent = `${Math.round(Math.max(0, (PAD_Y - right.tip[1]) / PX_PER_CM))} cm`;
  if (arms.length > 1) el('text', { x: 40, y: 500, fill: '#9ec5ff', 'font-size': 15, 'font-weight': 700, 'font-family': 'system-ui' }).textContent = `blue = ${mirror ? 'right' : 'left'} hand (behind)`;
  if (mirror) root.querySelectorAll('text').forEach(t => { const tx = Number(t.getAttribute('x')); t.setAttribute('transform', `translate(${2 * tx} 0) scale(-1 1)`); t.setAttribute('text-anchor', 'end'); });
}

const ART = { grip: true, kick: true } as Partial<Record<DemoId, true>>; // the close-ups (demoArt.ts); the rest are the arm drawing above
const flipTexts = (root: Element) => root.querySelectorAll('text').forEach(t => {
  const x = Number(t.getAttribute('x')), a = t.getAttribute('text-anchor');
  t.setAttribute('transform', `translate(${2 * x} 0) scale(-1 1)`); t.setAttribute('text-anchor', a === 'end' ? 'start' : a === 'middle' ? 'middle' : 'end');
});

// The web's CSS (src/ui/styles.css .technique), inline.
const INK = '#141414', POP = '#FFE14D', CYAN = '#2DE1C2', GOOD = '#1E9E5A', BAD = '#E8423F', DISPLAY = "'Arial Black', system-ui, sans-serif";
const css = {
  root: { fontFamily: 'system-ui, sans-serif', color: INK, margin: 0 } as CSSProperties,
  pair: { display: 'flex', gap: 10 } as CSSProperties,
  stage: { position: 'relative', background: INK, border: `3px solid ${INK}`, boxShadow: `5px 5px 0 ${INK}`, flex: 1 } as CSSProperties,
  svg: { display: 'block', width: '100%', height: 'auto' } as CSSProperties,
  word: (compact: boolean, wrong: boolean) => ({ position: 'absolute', top: 10, left: 14, font: `800 ${compact ? 24 : 36}px/1 ${DISPLAY}`, color: wrong ? BAD : POP, textShadow: '3px 3px 0 #000' }) as CSSProperties,
  count: (compact: boolean) => ({ position: 'absolute', top: 12, right: 14, display: 'flex', gap: 10, font: `800 ${compact ? 18 : 24}px ${DISPLAY}`, color: '#666' }) as CSSProperties,
  view: { position: 'absolute', top: 50, right: 14, font: `800 12px ${DISPLAY}`, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9a9a9a' } as CSSProperties,
  bar: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' } as CSSProperties,
  seg: { display: 'inline-flex', border: `2px solid ${INK}` } as CSSProperties,
  btn: (on: boolean, bad = false, last = false) => ({
    font: '700 16px system-ui', minHeight: 44, padding: '0 14px', border: 0, borderRight: last ? 0 : `2px solid ${INK}`, borderRadius: 0,
    background: on ? (bad ? BAD : GOOD) : '#fff', color: on ? '#fff' : INK,
  }) as CSSProperties,
  talk: (on: boolean) => ({ font: '700 16px system-ui', minHeight: 44, padding: '0 14px', border: `2px solid ${INK}`, borderRadius: 0, background: on ? POP : '#fff', color: INK }) as CSSProperties,
  check: { font: '700 16px system-ui', display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 } as CSSProperties,
  title: { margin: '12px 0 0', fontSize: 18 } as CSSProperties,
  what: { fontSize: 17, margin: '10px 0 6px' } as CSSProperties,
  watch: { fontSize: 16, marginBottom: 4 } as CSSProperties,
  small: { fontSize: 14 } as CSSProperties,
};

/**
 * The animated technique: right vs wrong, slow motion, the count. `bpm`: the lesson's tempo (the diagram moves at it).
 * The grip is shown from the thumb side and from above (both in the full view, a switch in the small one); the kick
 * heel down or heel up.
 */
export default function TechniqueDom({ id, bpm = 70, compact = false, heelUp, mirror = false, canSpeak = false, say }: TechniqueDomProps) {
  const d = DEMOS[id];
  const g = useRef<SVGGElement>(null), g2 = useRef<SVGGElement>(null);
  const wordRef = useRef<HTMLDivElement>(null), countRef = useRef<HTMLDivElement>(null), word2 = useRef<HTMLDivElement>(null), count2 = useRef<HTMLDivElement>(null);
  const [wrong, setWrong] = useState(false), [speed, setSpeed] = useState(compact ? 0.5 : 1), [joints, setJoints] = useState(!compact && !!ART[id]);
  const [view, setView] = useState<'side' | 'above'>('side'), [mode, setMode] = useState<KickMode>(heelUp ? 'up' : 'down');
  const art = !!ART[id], both = art && id === 'grip' && !compact;
  const kickText = id === 'kick' ? KICK_TEXT[mode] : undefined;
  // D15: the coach talks you through it: on by default in the full view, one tap in the small one; never during a
  // take or with the voice off.
  const [talk, setTalk] = useState(!compact);
  const speak = useRef({ talk, canSpeak, say });
  speak.current = { talk, canSpeak, say };
  const canTalk = () => speak.current.talk && speak.current.canSpeak && !!speak.current.say;
  useEffect(() => { if (canTalk()) void speak.current.say?.(wrong ? `The mistake: ${d.mistake}` : kickText?.what ?? d.what, true); }, [id, wrong, talk, mode]); // eslint-disable-line react-hooks/exhaustive-deps -- once per demo, side or switch
  useEffect(() => {
    if (!art && !('right' in d) && !('leg' in d)) return;
    if (art) ensureArtDefs();
    let beat = 0, last = performance.now(), raf = 0, said: string | undefined;
    const trail: Pt[] = [], st: HitState = {}, st2: HitState = {};
    const counts = (el: HTMLDivElement | null, cs: string[]) => {
      if (!el || !cs.length) return;
      const k = Math.floor(((beat % d.beats) / d.beats) * cs.length);
      el.replaceChildren(...cs.map((c, i) => {
        const s = document.createElement('span');
        s.textContent = mirror ? mirrorHands(c) : c;
        if (i === k) s.style.color = CYAN;
        return s;
      }));
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
          if (word2.current) word2.current.textContent = w2 ?? word ?? '';
          counts(count2.current, ['R', 'L', 'R', 'L']);
        }
      } else {
        if (g.current) draw(g.current, id, beat, wrong, trail, joints, mirror);
        word = poseAt(id, beat, wrong).word;
      }
      if (wordRef.current) wordRef.current.textContent = word ?? '';
      if (word && word !== said && beat < 2 * d.beats && canTalk()) void speak.current.say?.(word.toLowerCase(), false);
      said = word;
      counts(countRef.current, id === 'grip' && view === 'above' && !both ? ['R', 'L', 'R', 'L'] : d.counts);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [id, bpm, speed, wrong, joints, d, mirror, talk, view, mode, art, both]); // eslint-disable-line react-hooks/exhaustive-deps -- canTalk reads the latest props

  const box = id === 'kick' ? KICK_VIEWBOX : art ? GRIP_VIEWBOX : '0 0 900 520';
  const stage = { box, mirror, wrong, compact, label: d.title };
  const segBtn = (on: boolean, label: string, onClick: () => void, last = false, bad = false) =>
    <button type="button" key={label} style={css.btn(on, bad, last)} aria-pressed={on} onClick={onClick}>{label}</button>;
  return (
    <div style={css.root}>
      {both ? <div style={css.pair}><Stage {...stage} g={g} word={wordRef} count={countRef} name="From the side" /><Stage {...stage} g={g2} word={word2} count={count2} name="From above" /></div>
        : <Stage {...stage} g={g} word={wordRef} count={countRef} name={id === 'grip' ? (view === 'side' ? 'From the side' : 'From above') : id === 'kick' ? (mode === 'down' ? 'Heel down' : 'Heel up') : undefined} />}
      <div style={css.bar}>
        <span style={css.seg}>{segBtn(!wrong, '✓ Right', () => setWrong(false))}{segBtn(wrong, '✗ Wrong', () => setWrong(true), true, true)}</span>
        {id === 'grip' && !both && <span style={css.seg}>{segBtn(view === 'side', 'Side', () => setView('side'))}{segBtn(view === 'above', 'Above', () => setView('above'), true)}</span>}
        {id === 'kick' && <span style={css.seg}>{segBtn(mode === 'down', 'Heel down', () => setMode('down'))}{segBtn(mode === 'up', 'Heel up', () => setMode('up'), true)}</span>}
        <span style={css.seg}>{([[1, '1×'], [0.5, '½×'], [0.25, '¼×']] as const).map(([v, l], i) => segBtn(speed === v, l, () => setSpeed(v), i === 2))}</span>
        {!compact && <label style={css.check}><input type="checkbox" checked={joints} onChange={e => setJoints(e.target.checked)} /> {art ? 'Labels' : 'Joints'}</label>}
        <button type="button" style={css.talk(talk)} aria-pressed={talk} onClick={() => setTalk(!talk)}>{talk ? '🔊 Talking you through it' : '🔈 Talk me through it'}</button>
      </div>
      {!compact && <>
        {kickText && <h4 style={css.title}>{kickText.title}</h4>}
        <p style={css.what}>{kickText?.what ?? d.what}</p>
        <ul>{(kickText?.watch ?? d.watch).map(w => <li key={w} style={css.watch}>{w}</li>)}</ul>
        <p style={css.small}><b>✗ Wrong:</b> {d.mistake}</p>
      </>}
    </div>
  );
}

/** One drawing: the SVG the frame loop draws into (mirrored for a left-handed player), the cue word, the count, which view. */
function Stage({ box, mirror, wrong, compact, label, g, word, count, name }: { box: string; mirror: boolean; wrong: boolean; compact: boolean; label: string; name?: string;
  g: React.RefObject<SVGGElement | null>; word: React.RefObject<HTMLDivElement | null>; count: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div style={css.stage}>
      <svg viewBox={box} role="img" aria-label={`${label}${name ? `, ${name.toLowerCase()}` : ''}, animated`} style={css.svg}><g transform={mirror ? `translate(${box.split(' ')[2]} 0) scale(-1 1)` : undefined}><g ref={g} /></g></svg>
      <div style={css.word(compact, wrong)} ref={word} aria-live="off" />
      <div style={css.count(compact)} ref={count} aria-hidden />
      {name && <div style={css.view}>{name}</div>}
    </div>
  );
}
