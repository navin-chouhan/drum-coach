// "How it moves" (R5): the body as joints and bones, posed from keyframes per beat. Pure geometry, so a technique is a
// few lines of data (content/demos.ts) and runs at any tempo. Screen coordinates: x right, y down, angles in degrees
// (+ = clockwise / downward). The pad's top is at PAD_Y; heights are measured against it.

export type Pt = [number, number];
export const PAD_Y = 356, PX_PER_CM = 8.6;
const R = Math.PI / 180;
export const at = (p: Pt, len: number, deg: number): Pt => [p[0] + len * Math.cos(deg * R), p[1] + len * Math.sin(deg * R)];

/** An arm: upper arm, forearm, hand to the fulcrum, then the stick (butt behind, tip ahead). */
export const ARM = { upper: 135, fore: 150, hand: 48, butt: 85, tip: 215 };
/** up = upper-arm angle, fa = forearm angle, wr = wrist (− cocked up), fg = fingers (the stick against the hand). */
export type ArmPose = { up: number; fa: number; wr: number; fg: number };
/** board = pedal footboard angle (− = toe end up), lift = heel raised off the plate (0 = heel down). */
export type LegPose = { board: number; lift: number };
export type Pose = ArmPose | LegPose;

export function armPoints(shoulder: Pt, p: ArmPose) {
  const E = at(shoulder, ARM.upper, p.up), W = at(E, ARM.fore, p.fa), hand = p.fa + p.wr, F = at(W, ARM.hand, hand), stick = hand + p.fg;
  return { S: shoulder, E, W, F, hand, stick, tip: at(F, ARM.tip, stick), butt: at(F, -ARM.butt, stick) };
}
/** Stick tip height above the pad, in cm. */
export const tipCm = (shoulder: Pt, p: ArmPose) => (PAD_Y - armPoints(shoulder, p).tip[1]) / PX_PER_CM;

export const LEG = { hip: [300, 250] as Pt, thigh: 178, shin: 178, heelPlate: [520, 452] as Pt, board: 200, foot: 170 };
/** Two-bone IK: the knee between hip and ankle, bent upward. */
export function ik(a: Pt, b: Pt, l1: number, l2: number): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.min(l1 + l2 - 1, Math.hypot(dx, dy)), base = Math.atan2(dy, dx) / R;
  const alpha = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)) / R;
  const k1 = at(a, l1, base - alpha), k2 = at(a, l1, base + alpha);
  return k1[1] < k2[1] ? k1 : k2;
}
/** The leg on the kick pedal: heel on the plate (lift 0) or raised and rolling on the ball of the foot. */
export function legPoints(p: LegPose) {
  const H0 = LEG.heelPlate, toeEnd = at(H0, LEG.board, p.board), ball = at(H0, 128, p.board);
  const fdir = p.lift ? p.board + p.lift : p.board, heel = p.lift ? at(ball, -122, fdir) : at(H0, 6, p.board);
  const n = fdir - 90, toe = at(heel, LEG.foot, fdir), ankle = at(at(heel, 34, fdir), 44, n);
  const pivot: Pt = [H0[0] + 214, H0[1] - 140], beaterDeg = -150 + (p.board + 24) * 4.6, beater = at(pivot, 130, beaterDeg);
  return { hip: LEG.hip, knee: ik(LEG.hip, ankle, LEG.thigh, LEG.shin), ankle, heel, ball, toe, fdir, n, H0, toeEnd, pivot, beater, headX: 760 };
}

// ---------- timelines ----------
export type Ease = 'in' | 'out' | 'io' | 'lin';
export type Key<P> = { t: number; p: P; ease?: Ease; word?: string };
const EASE: Record<Ease, (x: number) => number> = { in: x => x * x, out: x => 1 - (1 - x) ** 2, io: x => x * x * (3 - 2 * x), lin: x => x };
/**
 * The pose at `beat` of a looping timeline `beats` long: eased between the keys (the ease belongs to the key you move
 * towards: 'in' accelerates into a stroke, 'out' slows a rebound). `word` = the last cue word reached.
 */
export function sample<P extends Pose>(keys: Key<P>[], beats: number, beat: number): { pose: P; word?: string } {
  const b = ((beat % beats) + beats) % beats, ks = [...keys, { ...keys[0], t: keys[0].t + beats }];
  let i = ks.length - 2;
  while (i > 0 && ks[i].t > b) i--;
  const a = ks[i], z = ks[i + 1], u = EASE[z.ease ?? 'io']((b - a.t) / Math.max(1e-6, z.t - a.t));
  const pose = Object.fromEntries(Object.keys(a.p).map(k => [k, (a.p as Record<string, number>)[k] + ((z.p as Record<string, number>)[k] - (a.p as Record<string, number>)[k]) * u])) as P;
  const word = [...keys].reverse().find(k => k.word && k.t <= b + 1e-9)?.word ?? [...keys].reverse().find(k => k.word)?.word;
  return { pose, word };
}
