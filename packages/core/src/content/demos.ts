import type { Chart } from '../engine/chart.ts';
import { sample, type ArmPose, type Key, type LegPose, type Pt } from '../engine/demoPose.ts';

// "How it moves" (R5): techniques as pose keyframes per beat (engine/demoPose.ts draws and eases them). Each has the
// right way and the usual beginner mistake ("wrong"), plus the words that go with it. Drawn, offline, no video.

export const SHOULDER: Pt = [175, 118], LEFT_SHOULDER: Pt = [140, 118];
// named arm poses (the tip heights are tested: contact on the pad, low ≈ 3 cm, mid ≈ 15 cm, high ≈ 30 cm)
export const ARM_POSES = {
  contact: { up: 72, fa: 14, wr: 0, fg: 2 }, high: { up: 66, fa: 6, wr: -38, fg: -4 }, mid: { up: 69, fa: 10, wr: -20, fg: -2 },
  low: { up: 71.5, fa: 13, wr: -3, fg: 0.5 }, lowBounce: { up: 71.8, fa: 13.5, wr: -1.5, fg: 1 },
  liftW: { up: 68, fa: 9, wr: -24, fg: 22 }, fingers: { up: 70, fa: 12, wr: -14, fg: 22.5 },
  armOnly: { up: 52, fa: -14, wr: 0, fg: 2 }, buried: { up: 72.5, fa: 14.5, wr: 0.5, fg: 2.5 },
} satisfies Record<string, ArmPose>;
type PoseName = keyof typeof ARM_POSES;
const K = (t: number, pose: PoseName | ArmPose, ease: Key<ArmPose>['ease'] = 'io', word?: string): Key<ArmPose> =>
  ({ t, p: typeof pose === 'string' ? ARM_POSES[pose] : pose, ease, word });
const L = (t: number, board: number, lift: number, ease: Key<LegPose>['ease'] = 'io', word?: string): Key<LegPose> => ({ t, p: { board, lift }, ease, word });

export type Demo = {
  title: string; beats: number; counts: string[];
  what: string; watch: string[]; mistake: string;
  right?: Key<ArmPose>[]; wrong?: Key<ArmPose>[]; left?: Key<ArmPose>[]; leftWrong?: Key<ArmPose>[]; // a second hand (behind)
  leg?: { right: Key<LegPose>[]; wrong: Key<LegPose>[] };
};

export const DEMOS = {
  grip: {
    title: 'The grip', beats: 2, counts: ['1', '&', '2', '&'],
    what: 'The stick rocks at one point: the thumb pad on top and the first joint of the index finger under it, a third up from the end. The wrist turns; the back fingers guide loosely.',
    watch: ['The stick rocks in the hand at one point: thumb pad + first joint of the index finger, a third up from the end.', 'The wrist turns; the forearm hardly moves.',
      'A small gap between the palm and the stick: the back fingers guide, they never squeeze.', 'From above: back of the hand up, thumbs along the sides, the butt end showing behind the hand.'],
    mistake: 'A fist, thumb on top: the stick can\'t bounce and the arm has to lift it. Or holding the very end: no balance point, and the stick dies on the pad.',
  },
  rebound: {
    title: 'Full stroke', beats: 2, counts: ['1', '&', '2', '&'],
    what: 'Drop the stick from 30 cm and let it bounce back up by itself. The wrist starts it; the stick does the rest.',
    watch: ['The tip comes back up to the same height without you lifting it.', 'Wrist and forearm relaxed: the elbow barely moves.', 'Contact is short: hit and leave.'],
    mistake: 'Squeezing: the stick stays on the pad, then the whole arm lifts it. Tiring, loud and slow.',
    right: [K(0, 'contact', 'in', 'BOUNCE'), K(0.28, 'high', 'out'), K(0.62, 'high', 'io', 'DROP'), K(1, 'contact', 'in', 'BOUNCE'), K(1.28, 'high', 'out'), K(1.62, 'high', 'io', 'DROP')],
    wrong: [K(0, 'buried', 'in', 'PRESSED IN'), K(0.25, 'buried', 'lin'), K(0.6, 'armOnly', 'io', 'ARM LIFTS'), K(1, 'buried', 'in', 'PRESSED IN'), K(1.25, 'buried', 'lin'), K(1.6, 'armOnly', 'io', 'ARM LIFTS')],
  },
  'accent-tap': {
    title: 'Accent and taps', beats: 2, counts: ['>1', '&', '2', '&'],
    what: 'The accent drops from high and STOPS low (a down stroke). Taps stay at 3 cm. The tap before the next accent lifts the stick (an up stroke).',
    watch: ['After the accent the tip freezes low: no bounce back up.', 'Taps are small wrist movements, the same height every time.', 'The last tap and the lift are one motion.'],
    mistake: 'Every stroke from the same height: the accent is no louder, or the taps are as loud as the accent.',
    right: [K(0, 'contact', 'in', 'STOP LOW'), K(0.14, 'low', 'out'), K(0.3, 'low', 'io', 'TAP'), K(0.5, 'contact', 'in'), K(0.64, 'low', 'out'), K(0.8, 'low', 'io', 'TAP'), K(1, 'contact', 'in'), K(1.14, 'low', 'out'), K(1.3, 'low', 'io', 'TAP + LIFT'), K(1.5, 'contact', 'in'), K(1.74, 'high', 'out'), K(1.84, 'high', 'io', 'DROP')],
    wrong: [K(0, 'contact', 'in', 'ALL THE SAME'), K(0.25, 'mid', 'out'), K(0.5, 'contact', 'in'), K(0.75, 'mid', 'out'), K(1, 'contact', 'in'), K(1.25, 'mid', 'out'), K(1.5, 'contact', 'in'), K(1.75, 'mid', 'out')],
  },
  doubles: {
    title: 'Doubles (R R)', beats: 2, counts: ['1', '&', '2', '&'],
    what: 'Two notes from one motion: the wrist throws the first, then the wrist rises while the fingers pull the stick down for the second.',
    watch: ['Between the two notes the wrist goes UP while the tip stays down.', 'The second note comes from the fingers.', 'Both notes the same volume.'],
    mistake: 'Two wrist strokes: the second one is weaker and late, and at speed it falls apart.',
    right: [K(0, 'contact', 'in', 'WRIST'), K(0.22, 'liftW', 'out', 'FINGERS'), K(0.5, 'fingers', 'in'), K(0.8, 'high', 'out', 'BOUNCE UP'), K(1.7, 'high', 'io', 'DROP')],
    wrong: [K(0, 'contact', 'in', 'WRIST'), K(0.25, 'mid', 'out', 'WRIST AGAIN'), K(0.5, 'contact', 'in'), K(0.9, 'high', 'out'), K(1.7, 'high', 'io')],
  },
  flam: {
    title: 'Alternating flams', beats: 2, counts: ['lR', '&', 'rL', '&'],
    what: 'One stick low (3 cm), one high (30 cm). Both drop together; the low one lands a hair first. Then they swap: the loud hand stays low, the soft one comes up.',
    watch: ['Two heights before every flam: 3 cm and 30 cm.', 'The hand that played loud stays down; the soft one lifts.', 'Two notes, very close: "fla-am".'],
    mistake: 'Both sticks at the same height: they land together (one fat note) or far apart (two notes).',
    right: [K(0, 'contact', 'in', 'MAIN'), K(0.14, 'low', 'out', 'STAY LOW'), K(0.9, 'low', 'io'), K(0.94, 'contact', 'in', 'GRACE'), K(1.4, 'high', 'out', 'UP'), K(1.78, 'high', 'io', 'DROP')],
    left: [K(0, 'high', 'io', 'UP'), K(0.6, 'high', 'io'), K(1, 'contact', 'in', 'MAIN'), K(1.14, 'low', 'out'), K(1.9, 'low', 'io'), K(1.94, 'contact', 'in', 'GRACE'), K(1.99, 'high', 'out')],
    wrong: [K(0, 'contact', 'in', 'SAME HEIGHT'), K(0.3, 'mid', 'out'), K(0.6, 'mid', 'io'), K(1, 'contact', 'in', 'ONE FAT NOTE'), K(1.3, 'mid', 'out'), K(1.6, 'mid', 'io')],
    leftWrong: [K(0, 'mid', 'out'), K(0.6, 'mid', 'io'), K(0.97, 'contact', 'in'), K(1.3, 'mid', 'out'), K(1.6, 'mid', 'io'), K(1.97, 'contact', 'in')],
  },
  drag: {
    title: 'The drag', beats: 2, counts: ['llR', '&', '2', '&'],
    what: 'The low hand lets its stick bounce twice, tiny and close to the pad, then the high hand drops the main note.',
    watch: ['The grace stick never comes higher than 3 cm.', 'The two grace notes are one wrist drop: the second is a bounce.', 'The main note lands right after them.'],
    mistake: 'Two separate wrist strokes for the grace notes: too loud, too slow, and the drag turns into three notes.',
    right: [K(0, 'contact', 'in', 'MAIN'), K(0.3, 'high', 'out', 'UP'), K(1.7, 'high', 'io', 'DROP')],
    left: [K(0, 'low', 'out'), K(1.8, 'low', 'io', 'BOUNCE-BOUNCE'), K(1.88, 'contact', 'in'), K(1.91, 'lowBounce', 'out'), K(1.94, 'contact', 'in'), K(1.98, 'low', 'out')],
    wrong: [K(0, 'contact', 'in', 'MAIN'), K(0.3, 'high', 'out'), K(1.7, 'high', 'io')],
    leftWrong: [K(0, 'low', 'out'), K(1.5, 'mid', 'io', 'TWO STROKES'), K(1.7, 'contact', 'in'), K(1.8, 'mid', 'out'), K(1.92, 'contact', 'in'), K(1.98, 'low', 'out')],
  },
  kick: {
    title: 'Kick: heel down / heel up', beats: 2, counts: ['1', '&', '2', '&'], // drawn on a real pedal (ui/demoArt.ts); these leg keys still give poseAt its words
    what: 'Heel down: the ankle does the work, soft and controlled. Heel up: the whole leg drops onto the ball of the foot, for volume. Both let the beater come back off the head.',
    watch: ['Heel down: the heel stays on the plate, only the foot rocks.', 'Heel up: the heel floats, the knee lifts a little before each note.', 'The beater bounces back off the head.'],
    mistake: 'Burying: the foot stays pressed after the note, so the beater rests on the pad and chokes the sound. Let the pedal push your foot back up.',
    leg: {
      right: [L(0, -8, 0, 'in', 'ANKLE'), L(0.3, -24, 0, 'out'), L(0.7, -24, 0), L(1, -8, 30, 'in', 'WHOLE LEG'), L(1.3, -26, 38, 'out'), L(1.7, -26, 38)],
      wrong: [L(0, -6, 0, 'in', 'BURIED'), L(0.6, -6, 0, 'lin'), L(0.9, -24, 0), L(1, -6, 0, 'in', 'BURIED'), L(1.6, -6, 0, 'lin'), L(1.9, -24, 0)],
    },
  },
} satisfies Record<string, Demo>;
export type DemoId = keyof typeof DEMOS;
export const DEMO_IDS = Object.keys(DEMOS) as DemoId[];

/** Everything to draw at `beat`: the arms (right hand in front, an optional left hand behind) or the leg, and the cue word. */
export function poseAt(id: DemoId, beat: number, wrong = false) {
  const d: Demo = DEMOS[id];
  if (d.leg) { const s = sample(wrong ? d.leg.wrong : d.leg.right, d.beats, beat); return { arms: [], leg: s.pose, word: s.word }; }
  if (!d.right) return { arms: [], word: undefined };
  const r = sample(wrong ? d.wrong! : d.right, d.beats, beat);
  const left = d.left && sample(wrong ? d.leftWrong ?? d.left : d.left, d.beats, beat);
  return {
    arms: [...(left ? [{ shoulder: LEFT_SHOULDER, pose: left.pose, left: true }] : []), { shoulder: SHOULDER, pose: r.pose, left: false }],
    leg: undefined, word: r.word ?? left?.word,
  };
}

/**
 * The movement to show for a lesson step: its own, the lesson's, else one that fits what it plays (grace notes →
 * flam or drag, accents → accent and taps, only feet → the kick, hands → the full stroke). Every lesson has one.
 */
export function demoFor(lesson: { demo?: DemoId }, step: { demo?: DemoId; chart: Chart }): DemoId {
  if (step.demo ?? lesson.demo) return (step.demo ?? lesson.demo)!;
  const n = step.chart.notes;
  if (n.some(x => x.grace === 2 || x.grace === 3)) return 'drag';
  if (n.some(x => x.grace === 1)) return 'flam';
  if (n.every(x => x.drum === 'kick' || x.drum === 'hhPedal')) return 'kick';
  if (n.some(x => x.accent)) return 'accent-tap';
  return 'rebound';
}
