import { sample, type Key, type Pt } from '../engine/demoPose';

// D10 v2 "How it moves" close-ups, drawn into an SVG group each frame: the grip from the thumb side and from above
// (both hands), and the foot on a real kick pedal, heel down or heel up. Same keyframe engine as the full stroke
// (engine/demoPose.ts), so they run at the lesson's tempo and in slow motion. Each draw returns the cue word.

const NS = 'http://www.w3.org/2000/svg', R = Math.PI / 180;
const cos = (d: number) => Math.cos(d * R), sin = (d: number) => Math.sin(d * R);
const at = (p: Pt, len: number, deg: number): Pt => [p[0] + len * cos(deg), p[1] + len * sin(deg)];
const rot = (v: Pt, deg: number): Pt => [v[0] * cos(deg) - v[1] * sin(deg), v[0] * sin(deg) + v[1] * cos(deg)];
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const f1 = (v: number) => v.toFixed(1);
const pts = (a: Pt[]) => a.map(p => `${f1(p[0])},${f1(p[1])}`).join(' ');
type Attrs = Record<string, string | number>;
function el(parent: Element, tag: string, attrs: Attrs = {}, text?: string) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (text != null) e.textContent = text;
  parent.appendChild(e);
  return e;
}
const g = (parent: Element, transform?: string, extra: Attrs = {}) => el(parent, 'g', { ...(transform ? { transform } : {}), ...extra });
const tf = (p: Pt, deg: number, sx = 1, sy = 1) => `translate(${f1(p[0])} ${f1(p[1])}) rotate(${deg.toFixed(2)}) scale(${sx.toFixed(3)} ${sy})`;
const K = <P>(t: number, p: P, ease: Key<P>['ease'] = 'io', word?: string): Key<P> => ({ t, p, ease, word });
const INK = '#5a3b2a';
/** Per drawing: when the stick or beater last landed (for the flash and ripples). */
export type HitState = { was?: boolean; at?: number; L?: HitState; R?: HitState };

/** The gradients and shadows the drawings use, added to the page once (ids start with dc-). */
export function ensureArtDefs() {
  if (document.getElementById('dc-art-defs')) return;
  const stop = (o: number, c: string) => `<stop offset="${o}" stop-color="${c}"/>`;
  const lin = (id: string, stops: string, h = false) => `<linearGradient id="dc-${id}" x1="0" y1="0" x2="${h ? 1 : 0}" y2="${h ? 0 : 1}">${stops}</linearGradient>`;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('id', 'dc-art-defs'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.innerHTML = `<defs>${lin('wood', stop(0, '#F3D9A4') + stop(0.5, '#D9A862') + stop(1, '#A9773A'))}${lin('skin', stop(0, '#F7D0B2') + stop(1, '#E2A683'))}
    ${lin('skinLight', stop(0, '#FDE3CF') + stop(1, '#EFB894'))}${lin('fingerTurn', stop(0, '#E9AE8C') + stop(1, '#B9785A'), true)}${lin('skinDark', stop(0, '#E7B08E') + stop(1, '#C98B68'))}
    ${lin('sleeve', stop(0, '#FF6A5E') + stop(1, '#C92F2C'))}${lin('sleeveL', stop(0, '#5B8FF0') + stop(1, '#2554B8'))}${lin('denim', stop(0, '#4C80E8') + stop(1, '#1F4AA8'))}
    ${lin('metal', stop(0, '#C9CED6') + stop(1, '#6E747D'))}${lin('metalV', stop(0, '#6E747D') + stop(0.5, '#D5DAE1') + stop(1, '#6E747D'), true)}
    <radialGradient id="dc-rubber" cx=".45" cy=".4" r=".7">${stop(0, '#4a4a4a')}${stop(1, '#1c1c1c')}</radialGradient>
    <radialGradient id="dc-felt" cx=".35" cy=".35" r=".8">${stop(0, '#FFFFFF')}${stop(1, '#C9C2B4')}</radialGradient>
    <filter id="dc-soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000" flood-opacity=".55"/></filter>
    <filter id="dc-blur3"><feGaussianBlur stdDeviation="3"/></filter></defs>`;
  document.body.appendChild(svg);
}

function label(parent: Element, text: string, p: Pt, anchor: Pt, color = '#FFE14D', align = 'start') {
  el(parent, 'line', { x1: f1(p[0]), y1: f1(p[1]), x2: f1(anchor[0]), y2: f1(anchor[1]), stroke: color, 'stroke-width': 2 });
  el(parent, 'circle', { cx: f1(anchor[0]), cy: f1(anchor[1]), r: 3.5, fill: color });
  const lines = text.split('\n');
  lines.forEach((t, i) => el(parent, 'text', { x: f1(p[0]), y: f1(p[1] + (i - lines.length + 1) * 18 - 6), fill: color, 'font-size': 15, 'font-weight': 800, 'font-family': 'system-ui', 'text-anchor': align }, t));
}
function ripple(parent: Element, c: Pt, age: number, color: string, rx = 1, ry = 0.35) { // expanding rings where a stick lands
  if (age > 420) return;
  const u = age / 420;
  for (const k of [0, 0.35]) {
    const v = Math.min(1, u + k);
    el(parent, 'ellipse', { cx: f1(c[0]), cy: f1(c[1]), rx: f1(10 + 60 * v * rx), ry: f1((10 + 60 * v) * ry), fill: 'none', stroke: color, 'stroke-width': 3 * (1 - v), opacity: f1(1 - v) });
  }
}
const landed = (st: HitState, hit: boolean, now: number) => { if (hit && !st.was) st.at = now; st.was = hit; return now - (st.at ?? -1e9); };

// ---------- the grip from the thumb side (right hand) ----------
// Hand frame: origin at the wrist joint, x towards the knuckles, y towards the palm, in hand units (× HS on screen).
// The stick crosses the hand at the fulcrum Fh (thumb pad over it, index finger under it) and runs back under the palm.
type SidePose = { h: number; g: number; wy: number; o: number; sq: number };
const HS = 1.45;
const SIDE = { W0: [118, 196] as Pt, E: [-170, 158] as Pt, Fh: [96, 15] as Pt, g0: -10, butt: 150, tip: 215, padY: 320, r: 8 };
const SP: Record<string, SidePose> = {
  contact: { h: 20, g: 7, wy: 0, o: 0.15, sq: 0 }, high: { h: -28, g: 0, wy: -6, o: 1, sq: 0 },
  buried: { h: 22, g: 9, wy: 0, o: -0.6, sq: 1 }, armUp: { h: 16, g: 7, wy: -80, o: -0.6, sq: 1 },
};
const SIDE_KEYS = {
  right: [K(0, SP.contact, 'in', 'BOUNCE'), K(0.3, SP.high, 'out'), K(0.62, SP.high, 'io', 'DROP'), K(1, SP.contact, 'in', 'BOUNCE'), K(1.3, SP.high, 'out'), K(1.62, SP.high, 'io', 'DROP')],
  wrong: [K(0, SP.buried, 'in', 'SQUEEZE'), K(0.35, SP.buried, 'lin'), K(0.7, SP.armUp, 'io', 'ARM LIFTS'), K(1, SP.buried, 'in', 'SQUEEZE'), K(1.35, SP.buried, 'lin'), K(1.7, SP.armUp, 'io', 'ARM LIFTS')],
};
function sideGeom(p: SidePose) {
  const W: Pt = [SIDE.W0[0], SIDE.W0[1] + p.wy];
  const F = add(W, rot([SIDE.Fh[0] * HS, SIDE.Fh[1] * HS], p.h));
  const want = p.h + SIDE.g0 + p.g, sMax = Math.asin(Math.min(1, (SIDE.padY - F[1]) / SIDE.tip)) / R; // the pad stops the stick
  const s = Math.min(want, sMax);
  return { W, F, s, hit: want >= sMax - 0.4, tip: at(F, SIDE.tip, s) };
}
const toWorld = (G: { W: Pt }, h: number, v: Pt) => add(G.W, rot([v[0] * HS, v[1] * HS], h));
function drawStick(parent: Element, F: Pt, s: number, alpha = 1) {
  const st = g(parent, tf(F, s), { opacity: alpha }), r = SIDE.r, b = SIDE.butt, t = SIDE.tip;
  el(st, 'path', { d: `M${-b} ${-r} Q${-b - 5} 0 ${-b} ${r} L${t - 40} ${r * 0.62} Q${t - 12} ${r * 0.48} ${t - 6} ${r * 0.36} L${t - 6} ${-r * 0.36} Q${t - 12} ${-r * 0.48} ${t - 40} ${-r * 0.62} Z`, fill: 'url(#dc-wood)', stroke: '#2a1a08', 'stroke-width': 1.6 });
  el(st, 'ellipse', { cx: t - 2, cy: 0, rx: 8, ry: 6.2, fill: '#F3D9A4', stroke: '#2a1a08', 'stroke-width': 1.6 });
  if (alpha === 1) el(st, 'line', { x1: -b + 12, y1: -r * 0.45, x2: t - 46, y2: -r * 0.3, stroke: '#FFF3D6', 'stroke-width': 1.6, opacity: 0.75 });
}
export const GRIP_VIEWBOX = '0 0 640 400', KICK_VIEWBOX = '0 0 900 470';

export function drawGripSide(root: Element, beat: number, wrong: boolean, labels: boolean, now: number, st: HitState) {
  const keys = wrong ? SIDE_KEYS.wrong : SIDE_KEYS.right;
  const { pose: p, word } = sample(keys, 2, beat);
  const G = sideGeom(p), age = landed(st, G.hit, now);
  // the practice pad, from the side
  el(root, 'ellipse', { cx: 470, cy: SIDE.padY + 40, rx: 170, ry: 9, fill: '#000', opacity: 0.55 });
  el(root, 'rect', { x: 310, y: SIDE.padY + 12, width: 320, height: 24, rx: 7, fill: '#262626', stroke: '#000', 'stroke-width': 2 });
  el(root, 'rect', { x: 324, y: SIDE.padY, width: 292, height: 14, rx: 6, fill: age < 140 ? '#2DE1C2' : 'url(#dc-rubber)', stroke: '#000', 'stroke-width': 2 });
  if (!wrong) ripple(root, [G.tip[0], SIDE.padY + 2], age, '#2DE1C2', 1.6, 0.16);
  for (const [k, a] of [[0.09, 0.08], [0.06, 0.13], [0.03, 0.2]]) { const q = sideGeom(sample(keys, 2, beat - k).pose); drawStick(root, q.F, q.s, a); } // ghost sticks
  // forearm (sleeve to the elbow): it hardly moves; the wrist turns
  const W = G.W, fa = Math.atan2(W[1] - SIDE.E[1], W[0] - SIDE.E[0]) / R;
  const arm = g(root, tf(W, fa), { filter: 'url(#dc-soft)' });
  el(arm, 'path', { d: 'M-330 -46 C-200 -44 -80 -40 -24 -32 Q8 -28 10 0 Q8 30 -24 34 C-80 40 -200 46 -330 48 Z', fill: 'url(#dc-skin)', stroke: INK, 'stroke-width': 2.2 });
  el(arm, 'path', { d: 'M-150 -30 Q-110 -26 -70 -26', fill: 'none', stroke: '#C98B68', 'stroke-width': 2, opacity: 0.6 });
  el(arm, 'path', { d: 'M-330 -52 L-190 -48 Q-178 0 -190 50 L-330 54 Z', fill: 'url(#dc-sleeve)', stroke: '#000', 'stroke-width': 2 });
  el(arm, 'path', { d: 'M-196 -44 Q-186 0 -196 46', fill: 'none', stroke: '#8f1f1d', 'stroke-width': 3 });
  if (p.sq > 0.5) for (const x of [-150, -116, -82]) el(arm, 'path', { d: `M${x} -42 l6 -11 l6 11 l6 -11 l6 11`, fill: 'none', stroke: '#FF4D6D', 'stroke-width': 3.5, 'stroke-linejoin': 'round' }); // tension
  const hand = g(root, tf(W, p.h, HS, HS));
  const o = p.o * 7; // back fingers: open on the way up, loosely closed on contact, clamped when squeezing
  const backFill = p.sq > 0.5 ? '#E3957F' : 'url(#dc-skinDark)';
  for (const [x, k] of [[24, 0.82], [46, 0.9], [68, 1]]) { // little, ring, middle: curled under the stick, behind the index
    el(hand, 'path', { d: `M${x - 9} 14 C${x - 12} ${26 + o} ${x - 8} ${36 * k + 6 + o} ${x + 2} ${38 * k + 6 + o} C${x + 12} ${40 * k + 6 + o} ${x + 18} ${30 + o} ${x + 14} ${22 + o * 0.6} C${x + 12} ${18 + o * 0.4} ${x + 10} 14 ${x + 10} 10 Z`, fill: backFill, stroke: INK, 'stroke-width': 1.6 });
    if (p.sq > 0.5) el(hand, 'ellipse', { cx: x + 2, cy: 38 * k + 2 + o, rx: 4, ry: 3, fill: '#F7E3D6' }); // white knuckles
  }
  // index finger: from the knuckle forward, round the front of the stick and under it (the fulcrum's lower half)
  el(hand, 'path', { d: 'M74 -18 C92 -22 110 -14 117 0 C123 12 122 28 113 35 C104 42 91 41 86 34 C83 29 87 25 92 26 C100 27 106 22 106 14 C106 6 98 0 86 2 C80 3 74 0 72 -6 Z', fill: p.sq > 0.5 ? '#E9A98C' : 'url(#dc-skin)', stroke: INK, 'stroke-width': 1.8 });
  el(hand, 'path', { d: 'M114 6 Q119 12 115 19 M98 32 Q96 37 91 38', fill: 'none', stroke: '#B97A58', 'stroke-width': 1.3 });
  drawStick(root, G.F, G.s);
  // back of the hand and palm (over the stick where it runs into the hand)
  const hand2 = g(root, tf(W, p.h, HS, HS), { filter: 'url(#dc-soft)' });
  el(hand2, 'path', { d: 'M-8 -25 C18 -31 50 -31 74 -24 C86 -20 93 -12 92 -3 C90 4 84 8 76 12 C60 20 38 25 16 26 C4 27 -6 24 -9 17 C-13 6 -13 -14 -8 -25 Z', fill: 'url(#dc-skin)', stroke: INK, 'stroke-width': 1.8 });
  el(hand2, 'path', { d: 'M24 -28 Q32 -20 30 -12 M46 -29 Q54 -21 52 -14 M66 -26 Q72 -20 71 -13', fill: 'none', stroke: '#D49A78', 'stroke-width': 1.3, 'stroke-linecap': 'round' });
  el(hand2, 'path', { d: 'M78 -20 Q90 -16 90 -6', fill: 'none', stroke: '#FBE0CF', 'stroke-width': 2.5, 'stroke-linecap': 'round', opacity: 0.8 });
  if (p.sq < 0.5) { // thumb: flat along the side of the stick, its pad pressing on it, pointing to the tip
    el(hand2, 'path', { d: 'M4 6 C16 -2 36 -2 54 0 C72 2 92 5 106 8 C116 10 120 16 115 21 C108 25 96 24 84 23 C68 23 48 25 30 26 C14 27 2 20 4 6 Z', fill: 'url(#dc-skinLight)', stroke: INK, 'stroke-width': 2.2 });
    el(hand2, 'path', { d: 'M93 6.5 C101 6 109 8 112 12 C108 15 100 15 93 13 Z', fill: '#FBE3D4', stroke: INK, 'stroke-width': 1.1 });
    el(hand2, 'path', { d: 'M78 6 Q81 14 78 22', fill: 'none', stroke: '#B97A58', 'stroke-width': 1.3 });
    el(hand2, 'path', { d: 'M14 12 Q30 20 52 20', fill: 'none', stroke: '#D49A78', 'stroke-width': 1.2, opacity: 0.8 });
  } else { // a fist: the thumb pressed down on top of the stick
    el(hand2, 'path', { d: 'M6 -6 C26 -24 66 -26 94 -12 C108 -4 106 8 96 8 C78 4 52 0 30 10 C16 16 2 8 6 -6 Z', fill: 'url(#dc-skin)', stroke: INK, 'stroke-width': 1.8 });
    el(hand2, 'path', { d: 'M86 -12 Q98 -10 100 -2 Q94 1 86 -2 Z', fill: '#FBE3D4', stroke: INK, 'stroke-width': 1.1 });
    for (const [x, y] of [[100, -30], [114, -18], [120, -2]]) el(hand2, 'path', { d: `M${x} ${y} l7 -5`, stroke: '#FF4D6D', 'stroke-width': 2.6, 'stroke-linecap': 'round' });
  }
  // the fulcrum: where the stick pivots
  const pulse = Math.max(0, 1 - age / 300);
  el(root, 'circle', { cx: f1(G.F[0]), cy: f1(G.F[1]), r: f1(13 + 9 * pulse), fill: 'none', stroke: wrong ? '#FF4D6D' : '#FFE14D', 'stroke-width': 3.5, opacity: f1(0.6 + 0.4 * pulse) });
  if (wrong && G.hit) el(root, 'path', { d: `M${f1(G.tip[0] - 20)} ${SIDE.padY - 14} l7 -9 l7 9 l7 -9 l7 9 l7 -9`, fill: 'none', stroke: '#FF4D6D', 'stroke-width': 3 });
  if (labels) {
    const L = g(root);
    if (!wrong) {
      label(L, 'FULCRUM: the thumb pad on top,\nthe index finger under', [318, 386], [G.F[0] + 6, G.F[1] + 12]);
      label(L, 'back fingers loose:\na gap, they only guide', [14, 388], toWorld(G, p.h, [46, 40 + o]), '#2DE1C2');
      label(L, 'the wrist turns,\nthe forearm stays', [14, 106], [W[0] - 40, W[1] - 34], '#FFFFFF');
    } else {
      label(L, '✗ thumb on top,\nevery finger clamped', [14, 106], toWorld(G, p.h, [60, -20]), '#FF4D6D');
      label(L, '✗ the stick can\'t bounce:\nthe arm has to lift it', [14, 388], [W[0] - 70, W[1] + 30], '#FF4D6D');
    }
  }
  return word;
}

// ---------- the grip from above (both hands, matched grip) ----------
// Plan view. Each forearm is still at the wrist W; the hand pitches (et, + = down) and the stick pitches (th, + = up).
// Hand frame: origin at the fulcrum, x forward along the hand, y to the little-finger side (mirrored for the left hand).
type AbovePose = { th: number; et: number };
type Hand = { id: 'L' | 'R'; tip: Pt; psi: number; side: 1 | -1; sleeve: string; W: Pt; Ww: Pt };
const AHS = 1.3, AB = { pad: [320, -70] as Pt, padR: 150, hW: 40, hl: 104, butt: 180, tip: 220 };
const AP = { contact: { th: -12, et: 10 }, high: { th: 38, et: -30 } };
const AW = { contact: { th: -12, et: 10 }, high: { th: 18, et: 4 } }; // holding the very end: stiff, small
const ABOVE_KEYS: Record<string, Key<AbovePose>[]> = {
  R: [K(0, AP.contact, 'in'), K(0.25, AP.high, 'out'), K(0.75, AP.high, 'io'), K(1, AP.contact, 'in'), K(1.25, AP.high, 'out'), K(1.75, AP.high, 'io')],
  L: [K(0, AP.high, 'io'), K(0.5, AP.contact, 'in'), K(0.75, AP.high, 'out'), K(1.25, AP.high, 'io'), K(1.5, AP.contact, 'in'), K(1.75, AP.high, 'out')],
  Rw: [K(0, AW.contact, 'in', 'NO BOUNCE'), K(0.4, AW.high, 'io'), K(1, AW.contact, 'in', 'NO BOUNCE'), K(1.4, AW.high, 'io')],
  Lw: [K(0, AW.high, 'io'), K(0.5, AW.contact, 'in'), K(0.9, AW.high, 'io'), K(1.5, AW.contact, 'in'), K(1.9, AW.high, 'io')],
};
const SHADOW: Pt = [0.34, 0.5], persp = (ht: number) => 1 + ht / 380;
const shadowOf = (xy: Pt, ht: number): Pt => [xy[0] + SHADOW[0] * ht, xy[1] + SHADOW[1] * ht];
const reachOf = (wrong: boolean) => (wrong ? AB.tip + AB.butt - 20 : AB.tip);
const wristOf = (h: Pick<Hand, 'tip' | 'psi' | 'side'>, wrong: boolean): Pt => { // the forearm stays put; placed so the tip lands on the pad
  const dir: Pt = [cos(h.psi), sin(h.psi)], hd = h.psi + h.side * 16, hl = AB.hl * AHS, reach = reachOf(wrong);
  const hF = AB.hW - hl * sin(AP.contact.et), th = Math.asin(-hF / reach) / R;
  const F: Pt = [h.tip[0] - reach * cos(th) * dir[0], h.tip[1] - reach * cos(th) * dir[1]];
  return [F[0] - hl * cos(AP.contact.et) * cos(hd), F[1] - hl * cos(AP.contact.et) * sin(hd)];
};
const HANDS: Hand[] = ([
  { id: 'L', tip: [290, 42], psi: -62, side: -1, sleeve: 'url(#dc-sleeveL)' },
  { id: 'R', tip: [350, 42], psi: -118, side: 1, sleeve: 'url(#dc-sleeve)' },
] satisfies Omit<Hand, 'W' | 'Ww'>[]).map(h => ({ ...h, W: wristOf(h, false), Ww: wristOf(h, true) }));
const ZOOM_W = 0.8; // holding the end puts the hands further back: the camera pulls back to keep them in view
const zoomPt = (p: Pt): Pt => [320 + (p[0] - 320) * ZOOM_W, p[1] * ZOOM_W];
function aboveGeom(h: Hand, p: AbovePose, wrong: boolean) {
  const dir: Pt = [cos(h.psi), sin(h.psi)], hd = h.psi + h.side * 16, hl = AB.hl * AHS, W = wrong ? h.Ww : h.W;
  const F: Pt = [W[0] + hl * cos(p.et) * cos(hd), W[1] + hl * cos(p.et) * sin(hd)], hF = AB.hW - hl * sin(p.et);
  const reach = reachOf(wrong), back = wrong ? 20 : AB.butt;
  const thMin = Math.asin(-hF / reach) / R, th = Math.max(p.th, thMin); // the pad stops the stick
  const P = (d: number) => ({ xy: [F[0] + d * cos(th) * dir[0], F[1] + d * cos(th) * dir[1]] as Pt, ht: Math.max(0, hF + d * sin(th)) });
  return { dir, hd, F, hF, c: cos(p.et), tip: P(reach), butt: P(-back), hit: p.th <= thMin + 0.5 };
}
function stickPoly(a: Pt, b: Pt, wa: number, wb: number, dir: Pt) {
  const n: Pt = [-dir[1], dir[0]];
  return pts([[a[0] + n[0] * wa, a[1] + n[1] * wa], [b[0] + n[0] * wb, b[1] + n[1] * wb], [b[0] - n[0] * wb, b[1] - n[1] * wb], [a[0] - n[0] * wa, a[1] - n[1] * wa]]);
}
function drawAboveHand(root: Element, h: Hand, G: ReturnType<typeof aboveGeom>, wrong: boolean) {
  const c = G.c, X = (x: number) => f1(x < 0 ? x * c : x); // the hand foreshortens as the wrist turns up
  const P = (s: string) => s.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${X(+x)} ${y}`); // "x,y" pairs → foreshortened
  const sx = f1(G.F[0] - 40 * cos(G.hd) + SHADOW[0] * G.hF), sy = f1(G.F[1] - 40 * sin(G.hd) + SHADOW[1] * G.hF);
  el(root, 'ellipse', { cx: sx, cy: sy, rx: 50, ry: 28, transform: `rotate(${G.hd.toFixed(1)} ${sx} ${sy})`, fill: '#000', opacity: 0.3, filter: 'url(#dc-blur3)' });
  const hg = g(root, `translate(${f1(G.F[0])} ${f1(G.F[1])}) rotate(${G.hd.toFixed(2)}) scale(${AHS} ${AHS * h.side})`);
  const wx = -104 * c;
  el(hg, 'path', { d: `M${f1(wx)} -21 L${f1(wx - 300)} -30 L${f1(wx - 300)} 30 L${f1(wx)} 23 Z`, fill: 'url(#dc-skin)', stroke: INK, 'stroke-width': 2.2 }); // forearm
  el(hg, 'path', { d: `M${f1(wx - 150)} -26 L${f1(wx - 300)} -34 L${f1(wx - 300)} 34 L${f1(wx - 150)} 28 Q${f1(wx - 142)} 0 ${f1(wx - 150)} -26 Z`, fill: h.sleeve, stroke: '#000', 'stroke-width': 2 });
  el(hg, 'path', { d: P('M-104,-21 C-80,-27 -48,-30 -24,-29 C-18,-24 -16,-12 -16,0 C-16,12 -19,24 -27,32 C-52,35 -82,31 -104,25 C-110,10 -110,-8 -104,-21 Z'), fill: 'url(#dc-skin)', stroke: INK, 'stroke-width': 2 });
  for (const [x, y, len, w] of [[-20, -5, 15, 12], [-22, 8, 14, 12], [-27, 20.5, 11, 10]]) // the fingers' first bones, turning down out of sight
    el(hg, 'rect', { x: X(x), y: y - w / 2, width: len, height: w, rx: w / 2, fill: 'url(#dc-fingerTurn)', stroke: INK, 'stroke-width': 1.5 });
  for (const [x, y] of [[-21, -18], [-20, -5], [-22, 8], [-27, 20.5]]) el(hg, 'path', { d: `M${X(x - 2)} ${y - 4} Q${X(x + 3)} ${y} ${X(x - 2)} ${y + 4}`, fill: 'none', stroke: '#FDE6D6', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
  el(hg, 'path', { d: P('M-24,-25 C-12,-29 1,-24 7,-15 C10,-9 6,-3 0,-5 C-7,-8 -14,-11 -22,-12 Z'), fill: 'url(#dc-fingerTurn)', stroke: INK, 'stroke-width': 1.6 }); // index round the stick
  if (!wrong) { // thumb along the inner side of the stick, its nail facing up and in
    el(hg, 'path', { d: P('M-94,-19 C-80,-37 -50,-42 -28,-37 C-12,-33 2,-27 9,-19 C13,-12 9,-5 2,-7 C-10,-13 -30,-19 -52,-19 C-70,-18 -86,-12 -94,-19 Z'), fill: 'url(#dc-skinLight)', stroke: INK, 'stroke-width': 2.2 });
    el(hg, 'ellipse', { cx: X(2), cy: -13, rx: 6.5, ry: 4.2, transform: `rotate(35 ${X(2)} -13)`, fill: '#FBE3D4', stroke: INK, 'stroke-width': 1.1 });
  } else { // thumb across the top of the stick
    el(hg, 'path', { d: P('M-92,-20 C-70,-34 -40,-30 -20,-16 C-8,-8 0,0 4,6 C6,12 0,14 -4,10 C-14,0 -34,-8 -54,-12 C-72,-14 -86,-10 -92,-20 Z'), fill: 'url(#dc-skin)', stroke: INK, 'stroke-width': 2 });
    el(hg, 'ellipse', { cx: X(0), cy: 7, rx: 6, ry: 4, transform: `rotate(60 ${X(0)} 7)`, fill: '#FBE3D4', stroke: INK, 'stroke-width': 1.1 });
  }
}

export function drawGripAbove(top: Element, beat: number, wrong: boolean, labels: boolean, now: number, st: HitState) {
  const root = g(top, wrong ? `translate(${320 * (1 - ZOOM_W)} 0) scale(${ZOOM_W})` : undefined);
  el(root, 'circle', { cx: AB.pad[0] + 12, cy: AB.pad[1] + 16, r: AB.padR + 6, fill: '#000', opacity: 0.45, filter: 'url(#dc-blur3)' });
  el(root, 'circle', { cx: AB.pad[0], cy: AB.pad[1], r: AB.padR + 10, fill: '#2b2b2b', stroke: '#000', 'stroke-width': 2 });
  let word: string | undefined;
  const geo = HANDS.map(h => {
    const keys = ABOVE_KEYS[h.id + (wrong ? 'w' : '')], s = sample(keys, 2, beat);
    if (h.id === 'R' && wrong) word = s.word;
    const G = aboveGeom(h, s.pose, wrong);
    return { h, keys, G, age: landed(st[h.id] ??= {}, G.hit, now) };
  });
  el(root, 'circle', { cx: AB.pad[0], cy: AB.pad[1], r: AB.padR, fill: geo.some(x => x.age < 140) ? '#1fa592' : 'url(#dc-rubber)', stroke: '#111', 'stroke-width': 3 });
  el(root, 'circle', { cx: AB.pad[0], cy: AB.pad[1], r: AB.padR * 0.5, fill: 'none', stroke: '#ffffff12', 'stroke-width': 2 });
  for (const x of geo) if (!wrong) ripple(root, x.G.tip.xy, x.age, '#2DE1C2', 1, 1);
  for (const { G } of geo) el(root, 'polygon', { points: stickPoly(shadowOf(G.butt.xy, G.butt.ht), shadowOf(G.tip.xy, G.tip.ht), 6, 4, G.dir), fill: '#000', opacity: 0.4, filter: 'url(#dc-blur3)' });
  for (const { h, keys, G } of geo) {
    for (const [k, a] of [[0.09, 0.08], [0.06, 0.13], [0.03, 0.2]]) {
      const q = aboveGeom(h, sample(keys, 2, beat - k).pose, wrong);
      el(root, 'polygon', { points: stickPoly(q.butt.xy, q.tip.xy, 7 * persp(q.butt.ht), 4.5 * persp(q.tip.ht), q.dir), fill: '#D9A862', opacity: a });
    }
    el(root, 'polygon', { points: stickPoly(G.butt.xy, G.tip.xy, 7 * persp(G.butt.ht), 4.5 * persp(G.tip.ht), G.dir), fill: 'url(#dc-wood)', stroke: '#2a1a08', 'stroke-width': 1.4 });
    el(root, 'circle', { cx: f1(G.tip.xy[0]), cy: f1(G.tip.xy[1]), r: f1(6 * persp(G.tip.ht)), fill: '#F3D9A4', stroke: '#2a1a08', 'stroke-width': 1.4 });
    drawAboveHand(root, h, G, wrong);
  }
  if (labels) {
    const L = g(top), [Lh, Rh] = geo, Z = wrong ? zoomPt : (p: Pt) => p;
    if (!wrong) {
      label(L, 'the butt end shows\nbehind the hand', [632, 246], Rh.G.butt.xy, '#FFE14D', 'end');
      label(L, 'thumbs along the\nsides, not on top', [12, 200], add(Lh.G.F, [-8, 2]), '#FFFFFF');
      label(L, 'the shadow shows\nhow high the tip is', [632, 140], shadowOf(Rh.G.tip.xy, Rh.G.tip.ht), '#2DE1C2', 'end');
    } else {
      label(L, '✗ holding the very end:\nno butt end, no balance point', [628, 230], Z(Rh.G.F), '#FF4D6D', 'end');
      label(L, '✗ thumbs on top', [12, 230], Z(add(Lh.G.F, [-4, 6])), '#FF4D6D');
    }
  }
  return word;
}

// ---------- the kick: a real pedal in front of the MPS-150 kick pad, heel down or heel up ----------
type FootPose = { board: number; lift: number };
export type KickMode = 'down' | 'up';
const LEG = { hip: [292, 226] as Pt, thigh: 182, shin: 186, H0: [520, 436] as Pt, board: 205, ball: 128, foot: 172, pivot: [736, 300] as Pt, beater: 128, padX: 764 };
const LP = (board: number, lift: number): FootPose => ({ board, lift });
const KICK_KEYS: Record<string, Key<FootPose>[]> = {
  down: [K(0, LP(-8, 0), 'in', 'ANKLE DOWN'), K(0.28, LP(-25, 0), 'out', 'UP'), K(0.72, LP(-25, 0)), K(1, LP(-8, 0), 'in', 'ANKLE DOWN'), K(1.28, LP(-25, 0), 'out', 'UP'), K(1.72, LP(-25, 0))],
  up: [K(0, LP(-8, 26), 'in', 'LEG DROPS'), K(0.28, LP(-25, 36), 'out', 'KNEE UP'), K(0.72, LP(-26, 40)), K(1, LP(-8, 26), 'in', 'LEG DROPS'), K(1.28, LP(-25, 36), 'out', 'KNEE UP'), K(1.72, LP(-26, 40))],
  downW: [K(0, LP(-6.5, 0), 'in', 'BURIED'), K(0.65, LP(-6.5, 0), 'lin'), K(0.92, LP(-24, 0)), K(1, LP(-6.5, 0), 'in', 'BURIED'), K(1.65, LP(-6.5, 0), 'lin'), K(1.92, LP(-24, 0))],
  upW: [K(0, LP(-6.5, 26), 'in', 'BURIED'), K(0.65, LP(-6.5, 26), 'lin'), K(0.92, LP(-24, 38)), K(1, LP(-6.5, 26), 'in', 'BURIED'), K(1.65, LP(-6.5, 26), 'lin'), K(1.92, LP(-24, 38))],
};
export const KICK_TEXT: Record<KickMode, { title: string; what: string; watch: string[] }> = {
  down: { title: 'Heel down: the ankle plays', what: 'The heel rests on the heel plate; the ankle rocks the front of the foot down and lets the pedal push it back up. Quiet and controlled: soft grooves, slow tempos, your first stages.',
    watch: ['The heel never leaves the plate (yellow ring).', 'Only the foot moves; the knee stays still.', 'The beater comes back off the pad by itself.'] },
  up: { title: 'Heel up: the leg plays', what: 'The heel floats; the knee lifts a little and the leg drops its weight onto the ball of the foot. More volume and speed: rock grooves from the money beat on.',
    watch: ['The heel stays up the whole time; the foot rocks on its ball (yellow ring).', 'The knee lifts a little before each note.', 'Still let the beater bounce back off the pad.'] },
};
function ik(a: Pt, b: Pt, l1: number, l2: number): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.min(l1 + l2 - 1, Math.hypot(dx, dy)), base = Math.atan2(dy, dx) / R;
  const al = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)) / R;
  const k1 = at(a, l1, base - al), k2 = at(a, l1, base + al);
  return k1[1] < k2[1] ? k1 : k2; // the knee is up
}
function kickGeom(p: FootPose) {
  const H0 = LEG.H0, toeEnd = at(H0, LEG.board, p.board);
  let bd = -150 + (p.board + 25) * 4.4; // the beater is linked to the footboard through the chain and cam
  const felt = (a: number) => at(LEG.pivot, LEG.beater, a);
  let hit = false;
  if (felt(bd)[0] + 17 >= LEG.padX) { bd = -90 + Math.asin((LEG.padX - 17 - LEG.pivot[0]) / LEG.beater) / R; hit = true; } // the pad stops it
  const ball = at(H0, LEG.ball, p.board), fdir = p.board + p.lift;
  const heel = p.lift > 0.5 ? at(ball, -LEG.ball + 4, fdir) : at(H0, 4, p.board);
  return { toeEnd, bd, hit, felt: felt(bd), ball, heel, fdir };
}
function quad(parent: Element, a: Pt, b: Pt, wa: number, wb: number, fill: string) { // a tapered limb
  const d = Math.atan2(b[1] - a[1], b[0] - a[0]) / R, n: Pt = [cos(d + 90), sin(d + 90)];
  el(parent, 'polygon', { points: pts([[a[0] + n[0] * wa, a[1] + n[1] * wa], [b[0] + n[0] * wb, b[1] + n[1] * wb], [b[0] - n[0] * wb, b[1] - n[1] * wb], [a[0] - n[0] * wa, a[1] - n[1] * wa]]), fill, stroke: '#0d1d45', 'stroke-width': 2, 'stroke-linejoin': 'round' });
}

export function drawKick(root: Element, beat: number, mode: KickMode, wrong: boolean, labels: boolean, now: number, st: HitState) {
  const keys = KICK_KEYS[mode + (wrong ? 'W' : '')];
  const { pose: p, word } = sample(keys, 2, beat);
  const G = kickGeom(p), H0 = LEG.H0, age = landed(st, G.hit, now);
  // floor and the throne
  el(root, 'rect', { x: 0, y: 448, width: 900, height: 22, fill: '#1f1f1f' });
  el(root, 'line', { x1: 0, y1: 448, x2: 900, y2: 448, stroke: '#333', 'stroke-width': 2 });
  for (const x2 of [176, 300, 404]) el(root, 'line', { x1: 290, y1: 330, x2, y2: 448, stroke: 'url(#dc-metalV)', 'stroke-width': 7, 'stroke-linecap': 'round' });
  el(root, 'rect', { x: 282, y: 250, width: 16, height: 100, fill: 'url(#dc-metalV)', stroke: '#000', 'stroke-width': 1.5 });
  el(root, 'rect', { x: 178, y: 226, width: 220, height: 32, rx: 14, fill: '#2a2a2a', stroke: '#000', 'stroke-width': 2 });
  el(root, 'rect', { x: 188, y: 230, width: 200, height: 8, rx: 4, fill: '#3d3d3d' });
  // the kick pad tower (MPS-150) in front
  const pad = g(root);
  el(pad, 'path', { d: 'M790 448 L812 404 L836 448 Z', fill: 'none', stroke: 'url(#dc-metalV)', 'stroke-width': 7, 'stroke-linejoin': 'round' });
  el(pad, 'rect', { x: 806, y: 210, width: 12, height: 200, fill: 'url(#dc-metalV)', stroke: '#000', 'stroke-width': 1.5 });
  el(pad, 'rect', { x: LEG.padX + 18, y: 196, width: 30, height: 18, fill: '#444', stroke: '#000', 'stroke-width': 1.5 });
  el(pad, 'rect', { x: LEG.padX, y: 120, width: 30, height: 170, rx: 10, fill: '#262626', stroke: '#000', 'stroke-width': 2 });
  el(pad, 'rect', { x: LEG.padX, y: 130, width: 9, height: 150, rx: 4, fill: age < 150 ? '#2DE1C2' : '#3a3a3a' });
  el(pad, 'text', { x: 812, y: 464, fill: '#8a8a8a', 'font-size': 12, 'font-weight': 700, 'font-family': 'system-ui', 'text-anchor': 'middle' }, 'MPS-150 kick');
  // sound: rings leave the pad on a good stroke, a short thud when the beater stays on it
  if (!wrong && age < 600) for (const k of [0, 0.3, 0.6]) {
    const v = Math.min(1, age / 600 + k);
    if (v >= 1) continue;
    el(root, 'path', { d: `M${f1(LEG.padX + 46 + v * 70)} ${f1(205 - 40 - v * 50)} Q${f1(LEG.padX + 70 + v * 100)} 205 ${f1(LEG.padX + 46 + v * 70)} ${f1(205 + 40 + v * 50)}`, fill: 'none', stroke: '#2DE1C2', 'stroke-width': 4 * (1 - v), opacity: f1(1 - v) });
  }
  if (wrong && G.hit) { el(root, 'path', { d: `M${LEG.padX + 84} 190 q8 15 0 30`, fill: 'none', stroke: '#FF4D6D', 'stroke-width': 3 }); el(root, 'text', { x: LEG.padX + 96, y: 212, fill: '#FF4D6D', 'font-size': 16, 'font-weight': 800, 'font-family': 'system-ui' }, 'thud'); }
  // the pedal: base, heel plate, post, spring, cam, chain, footboard, beater
  el(root, 'rect', { x: H0[0] - 34, y: H0[1], width: 290, height: 12, rx: 3, fill: 'url(#dc-metal)', stroke: '#000', 'stroke-width': 2 });
  el(root, 'rect', { x: H0[0] - 30, y: H0[1] - 7, width: 70, height: 8, rx: 2, fill: '#2f2f2f', stroke: '#000', 'stroke-width': 1.5 });
  el(root, 'rect', { x: LEG.pivot[0] - 7, y: LEG.pivot[1], width: 14, height: H0[1] - LEG.pivot[1], fill: 'url(#dc-metalV)', stroke: '#000', 'stroke-width': 1.5 });
  const spring: Pt[] = [];
  for (let i = 0; i <= 12; i++) spring.push([LEG.pivot[0] - 24 + (i % 2 ? -6 : 6), LEG.pivot[1] + 26 + i * 9]);
  el(root, 'polyline', { points: pts(spring), fill: 'none', stroke: '#B8BEC6', 'stroke-width': 2.5 });
  const gh = g(root);
  for (const [k, a] of [[0.07, 0.1], [0.045, 0.16], [0.02, 0.24]]) {
    const q = kickGeom(sample(keys, 2, beat - k).pose);
    el(gh, 'line', { x1: LEG.pivot[0], y1: LEG.pivot[1], x2: f1(q.felt[0]), y2: f1(q.felt[1]), stroke: '#ddd', 'stroke-width': 5, opacity: a });
    el(gh, 'circle', { cx: f1(q.felt[0]), cy: f1(q.felt[1]), r: 15, fill: '#eee', opacity: a });
  }
  el(root, 'line', { x1: LEG.pivot[0], y1: LEG.pivot[1], x2: f1(G.felt[0]), y2: f1(G.felt[1]), stroke: 'url(#dc-metal)', 'stroke-width': 6, 'stroke-linecap': 'round' });
  const fg = g(root, tf(G.felt, G.bd + 90));
  el(fg, 'rect', { x: -17, y: -20, width: 34, height: 30, rx: 12, fill: 'url(#dc-felt)', stroke: '#000', 'stroke-width': 2 });
  el(root, 'circle', { cx: LEG.pivot[0], cy: LEG.pivot[1], r: 15, fill: '#2a2a2a', stroke: '#B8BEC6', 'stroke-width': 3, 'stroke-dasharray': '4 3' });
  el(root, 'circle', { cx: LEG.pivot[0], cy: LEG.pivot[1], r: 5, fill: '#B8BEC6' });
  el(root, 'line', { x1: f1(G.toeEnd[0]), y1: f1(G.toeEnd[1]), x2: LEG.pivot[0] + 14, y2: LEG.pivot[1] + 4, stroke: '#9AA0A8', 'stroke-width': 5, 'stroke-dasharray': '5 3' });
  const bg = g(root, tf(H0, p.board));
  el(bg, 'path', { d: `M-6 -2 L${LEG.board} -6 L${LEG.board + 8} 2 L${LEG.board} 8 L-6 6 Z`, fill: 'url(#dc-metal)', stroke: '#000', 'stroke-width': 2 });
  for (let x = 30; x < LEG.board; x += 16) el(bg, 'line', { x1: x, y1: -4, x2: x + 6, y2: -4, stroke: '#555', 'stroke-width': 2 });
  el(root, 'circle', { cx: H0[0], cy: H0[1], r: 6, fill: '#B8BEC6', stroke: '#000', 'stroke-width': 1.5 });
  // the leg: hip on the throne, knee by two-bone IK, ankle above the heel
  const n = G.fdir - 90, ankle = add(at(G.heel, 36, G.fdir), [cos(n) * 58, sin(n) * 58]);
  const knee = ik(LEG.hip, ankle, LEG.thigh, LEG.shin);
  quad(root, LEG.hip, knee, 34, 26, 'url(#dc-denim)');
  quad(root, knee, ankle, 26, 21, 'url(#dc-denim)');
  el(root, 'circle', { cx: f1(knee[0]), cy: f1(knee[1]), r: 26, fill: 'url(#dc-denim)', stroke: '#0d1d45', 'stroke-width': 2 });
  el(root, 'path', { d: `M${f1(knee[0] - 12)} ${f1(knee[1] + 4)} q8 8 18 2`, fill: 'none', stroke: '#9ec0ff', 'stroke-width': 2, opacity: 0.6 });
  el(root, 'circle', { cx: LEG.hip[0], cy: LEG.hip[1], r: 34, fill: 'url(#dc-denim)', stroke: '#0d1d45', 'stroke-width': 2 });
  // the shoe, in the foot frame (origin at the heel's sole, x to the toe, -y up); the forefoot bends at the ball onto the board
  const bx = LEG.ball - 4, flex = p.lift;
  const F = (q: Pt[]) => q.map(([x, y]) => (x > bx ? add([bx, 0], rot([x - bx, y], -flex)) : [x, y] as Pt));
  const sh = g(root, tf(G.heel, G.fdir), { filter: 'url(#dc-soft)' });
  el(sh, 'polygon', { points: pts([[-4, -64], [30, -66], [36, -52], [2, -50]]), fill: '#EDEDED', stroke: '#000', 'stroke-width': 1.5 }); // sock
  el(sh, 'polygon', { points: pts(F([[-4, -12], [-7, -30], [-4, -50], [4, -61], [36, -61], [52, -58], [76, -52], [100, -44], [124, -37], [140, -33], [156, -28], [170, -22], [180, -15], [180, -12]])), fill: '#262626', stroke: '#000', 'stroke-width': 2, 'stroke-linejoin': 'round' });
  el(sh, 'polyline', { points: pts(F([[8, -30], [40, -38], [80, -36], [118, -28], [134, -26], [152, -21]])), fill: 'none', stroke: '#2DE1C2', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); // stripe
  for (const x of [58, 76, 94, 112]) { const [a, b] = F([[x, -51 + (x - 58) * 0.3], [x + 10, -47 + (x - 58) * 0.3]]); el(sh, 'line', { x1: f1(a[0]), y1: f1(a[1]), x2: f1(b[0]), y2: f1(b[1]), stroke: '#fff', 'stroke-width': 2.5, 'stroke-linecap': 'round' }); } // laces
  el(sh, 'polygon', { points: pts(F([[-6, 0], [40, 0], [90, 0], [124, 0], [150, 0], [174, 0], [184, -4], [182, -12], [124, -12], [60, -12], [-4, -12], [-9, -6]])), fill: '#F2F2F2', stroke: '#000', 'stroke-width': 2, 'stroke-linejoin': 'round' }); // sole
  // pivot ring: the heel (heel down) or the ball of the foot (heel up)
  const pv = mode === 'down' ? at(G.heel, 6, G.fdir) : G.ball;
  el(root, 'circle', { cx: f1(pv[0]), cy: f1(pv[1]), r: 14, fill: 'none', stroke: '#FFE14D', 'stroke-width': 4 });
  if (mode === 'up') el(root, 'path', { d: `M${f1(knee[0] - 40)} ${f1(knee[1] - 30)} q40 -28 80 0`, fill: 'none', stroke: '#FFE14D', 'stroke-width': 2.5, 'stroke-dasharray': '5 5' });
  if (labels) {
    const L = g(root);
    if (mode === 'down') label(L, wrong ? 'foot stays pressed' : 'pivot: the heel stays down', [360, 420], [pv[0] - 12, pv[1]], wrong ? '#FF4D6D' : '#FFE14D', 'end');
    else label(L, wrong ? 'foot stays pressed' : 'pivot: the ball of the foot', [470, 418], [pv[0] - 6, pv[1] + 10], wrong ? '#FF4D6D' : '#FFE14D', 'end');
    if (wrong && G.hit) label(L, '✗ beater left on the pad', [640, 100], [G.felt[0], G.felt[1] - 18], '#FF4D6D', 'end');
    else if (!wrong) label(L, 'the beater comes back\noff the pad by itself', [600, 92], [G.felt[0] - 10, G.felt[1] - 14], '#2DE1C2', 'end');
  }
  return word;
}
