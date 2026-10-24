import { beatsPerBar, pattern, type Chart, type ChartDrum, type ChartNote } from '../engine/chart.ts';
import type { Genre, Lesson, LessonKind, Milestone, Pass, Step } from '../engine/lesson.ts';

// The guided path. Milestones are fixed; each is proven by passing its checkpoint lessons.
// The other lessons here are the built-in fallback: the AI coach writes personal lessons per milestone
// (server/prompts/lesson.md) and the planner prefers those. Pedagogy: docs/LEARNING.md.
// Patterns: one char per step (x hit, X accent, g ghost, . rest); `spb` = steps per beat.

type Lines = Partial<Record<ChartDrum, string>>;
type TS = [number, 2 | 4 | 8 | 16];
const P = (spb: number, lines: Lines, bars = 1) => pattern(lines, spb, bars);

/** Joins bar groups end to end (4/4 unless given). */
function cat(parts: ChartNote[][], ts: TS = [4, 4]) {
  const bpb = beatsPerBar({ timeSignature: ts });
  let at = 0;
  return parts.flatMap(notes => {
    const out = notes.map(n => ({ ...n, t: n.t + at }));
    at += (Math.floor(Math.max(...notes.map(n => n.t)) / bpb + 1e-6) + 1) * bpb;
    return out;
  });
}
/** Crash on these beats; the hi-hat/ride note there is dropped (same hand). */
const crashOn = (notes: ChartNote[], beats: number[]) => [
  ...notes.filter(n => !(beats.includes(n.t) && (n.drum === 'hihat' || n.drum === 'ride' || n.drum === 'hhOpen'))),
  ...beats.map(t => ({ t, drum: 'crash' as const })),
].sort((a, b) => a.t - b.t);

type StepOpts = { lanes?: ChartDrum[]; pass?: Partial<Pass>; gap?: number; ts?: TS };
function step(title: string, text: string, notes: ChartNote[], bpm: [number, number], o: StepOpts = {}): Step {
  const ts = o.ts ?? [4, 4], bpb = beatsPerBar({ timeSignature: ts });
  const bars = Math.floor(Math.max(...notes.map(n => n.t)) / bpb + 1e-6) + 1;
  const chart: Chart = { title, bpm: bpm[1], timeSignature: ts, bars, notes };
  return { title, text, chart, bpm: { start: bpm[0], target: bpm[1] }, activeLanes: o.lanes, pass: o.pass, gapBars: o.gap };
}
const lesson = (level: number, id: string, kind: LessonKind, title: string, what: string, why: string, how: string, steps: Step[], tags?: Genre[]): Lesson =>
  ({ id, level, kind, title, what, why, how, tags, steps: steps.map((s, i) => ({ ...s, chart: { ...s.chart, id: `lesson/${id}/${i + 1}`, title: `${title} · ${s.title}` } })) });

// Grooves reused across lessons.
const MONEY8 = { hihat: 'xxxxxxxx', kick: 'x...x...', snare: '..x...x.' };
const HH_K_S: ChartDrum[] = ['hihat', 'kick', 'snare'];
const FILL8 = { snare: 'xx......', tom1: '..xx....', tom2: '....xx..', floor: '......xx' };
const SHUFFLE = { hihat: 'x.xx.xx.xx.x', kick: 'x.....x.....', snare: '...x.....x..' };
const TRIP_FILL = { snare: 'xxx.........', tom1: '...xxx......', tom2: '......xxx...', floor: '.........xxx' };
const JAZZ = { ride: 'x..x.xx..x.x', hhPedal: '...x.....x..' };

export const CURRICULUM: Lesson[] = [
  // ───────── Level 0: setup and counting ─────────
  lesson(0, 'posture', 'exercise', 'Sit, hold, strike',
    'How to sit at the kit, hold the sticks and let them bounce.',
    'Good setup prevents sore wrists and makes everything later easier. Pros spend years undoing bad habits; you get to skip that.',
    'Throne high enough that your thighs slope slightly down. Snare just above your lap. Hold each stick a third of the way up, between thumb and the first joint of your index finger (the fulcrum); the other fingers wrap loosely. Drop the stick from about 15 cm and let it bounce back up: you throw the stroke, the pad does the rest. Shoulders loose, wrists do most of the work. Keep headphones at a safe volume.',
    [step('Even strokes', 'Quarter notes on the snare, alternating hands (R L R L). Same height, same volume every time.', P(1, { snare: 'xxxx' }, 2), [60, 60], { pass: { maxVelocityCv: 25 } })]),
  lesson(0, 'count-quarters', 'exercise', 'Counting quarter notes',
    'Playing in time with the click while counting "1 2 3 4" out loud.',
    'Drummers keep the band in time. Counting out loud links your hands to the beat; every pro still does it when learning something new.',
    'Listen to the count-in, then say the numbers out loud as you play. The high click is beat 1 of each bar. Don\'t chase the click: feel where the next one will land and meet it.',
    [step('Snare on every beat', 'Say "1 2 3 4" out loud with each hit.', P(1, { snare: 'xxxx' }), [60, 80])]),
  lesson(0, 'count-8ths', 'exercise', 'Counting 8th notes',
    'Two even notes per beat, counted "1 & 2 & 3 & 4 &".',
    'Most rock and pop grooves are built on 8th notes. If you can count them, you can read most beginner grooves.',
    'Numbers land on the click, "&" lands exactly halfway between. Alternate hands R L R L. Keep the strokes small and relaxed.',
    [step('8ths on the snare', 'Count "1 & 2 & 3 & 4 &" out loud.', P(2, { snare: 'xxxxxxxx' }), [60, 80])]),
  lesson(0, 'rests', 'exercise', 'Rests are notes too',
    'Leaving a beat silent on purpose, while still counting it.',
    'Grooves are as much about the gaps as the hits. Counting through a rest keeps you from rushing into the next note.',
    'Keep counting every number out loud, including the silent one. Move your stick in the air on the rest if it helps.',
    [step('Rest on 3', 'Hit on 1, 2 and 4. Say "3" but don\'t play it.', P(1, { snare: 'xx.x' }), [60, 80]),
      step('Rest on 2 and 4', 'Skip the numbers 2 and 4 but play their &s: "1 & (2) & 3 & (4) &".', P(2, { snare: 'xx.xxx.x' }), [60, 80])]),

  // ───────── Level 1: one limb at a time ─────────
  lesson(1, 'hh-quarters', 'exercise', 'Hi-hat with the pedal down',
    'Quarter notes on the closed hi-hat.',
    'The hi-hat is the timekeeper of most grooves. Your foot holds it closed; your right hand (crossed over) keeps the pulse.',
    'Press the hi-hat pedal down and keep it down; on this kit the pad only sends "closed" while the pedal is held. Cross your right hand over the left. Hit the edge of the pad with the shoulder of the stick for a fuller sound.',
    [step('Quarter notes', 'Right hand on the hi-hat, pedal down, count "1 2 3 4".', P(1, { hihat: 'xxxx' }), [60, 100])]),
  lesson(1, 'kick-quarters', 'exercise', 'The kick drum',
    'Quarter notes with the right foot.',
    'The kick is the heartbeat. A steady foot makes every groove feel solid.',
    'Start heel-down: rest your heel on the pedal plate and press with the ball of your foot, letting the beater come back. Don\'t bury the beater into the head; let it bounce off. Later you can try heel-up for more power.',
    [step('Four on the floor', 'One kick per click. Say "1 2 3 4".', P(1, { kick: 'xxxx' }), [60, 100])]),
  lesson(1, 'singles', 'rudiment', 'Single strokes',
    'Alternating hands, R L R L, the first rudiment.',
    'Singles are the base of fills and fast hi-hat patterns. Even singles make you sound like a drummer.',
    'Same stick height in both hands. Watch your weaker hand: it tends to play lower and later. Let the stick rebound; don\'t press it into the pad.',
    [step('8th notes', 'R L R L, count "1 & 2 &". Make both hands sound the same.', P(2, { snare: 'xxxxxxxx' }), [60, 100], { pass: { maxVelocityCv: 20 } }),
      step('16th notes', 'R L R L four per beat, count "1 e & a".', P(4, { snare: 'xxxxxxxxxxxxxxxx' }), [60, 80], { pass: { maxVelocityCv: 20 } })]),
  lesson(1, 'accents', 'rudiment', 'Accents',
    'Some notes loud, the rest soft.',
    'Dynamics turn a pattern into music. The same groove with accents sounds twice as good.',
    'Accents come from height, not force: lift the stick high for the loud note and keep the soft ones low (a few cm). Keyboard: hold Shift for an accent.',
    [step('Accent the beat', 'Loud on the numbers, soft on the "&".', P(2, { snare: 'XxXxXxXx' }), [60, 90], { pass: { maxGhostToAccent: 0.8 } }),
      step('Accent every 4th', 'Loud only on the numbers, 16ths in between: "1 e & a".', P(4, { snare: 'XxxxXxxxXxxxXxxx' }), [60, 80], { pass: { maxGhostToAccent: 0.8 } })]),
  lesson(1, 'hh-8ths', 'exercise', 'Hi-hat 8th notes',
    '8th notes on the closed hi-hat with one hand.',
    'This is the right-hand part of the most common groove in pop and rock.',
    'Right hand only, pedal down. Make the numbers and the "&"s exactly even. The second step silences the click every other bar: keep going on your own.',
    [step('With the click', 'Right hand only. Count "1 & 2 & 3 & 4 &".', P(2, { hihat: 'xxxxxxxx' }), [60, 100]),
      step('Gap click', 'The click drops out every other bar. Keep the same tempo.', P(2, { hihat: 'xxxxxxxx' }, 2), [70, 100], { gap: 2 })]),
  lesson(1, 'hands-feet', 'exercise', 'Hand and foot together',
    'Hi-hat and kick landing at exactly the same moment.',
    'Your first taste of coordination. Flams between hand and foot are the most common beginner timing problem.',
    'Aim to hear one sound, not two. If they split, slow down and think "foot leads".',
    [step('Together on every beat', 'Hi-hat and kick together on 1 2 3 4.', P(1, { hihat: 'xxxx', kick: 'xxxx' }), [60, 90])]),

  // ───────── Level 2: the money beat ─────────
  lesson(2, 'money-quarters', 'groove', 'Your first beat',
    'Hi-hat on every beat, kick on 1 and 3, snare on 2 and 4.',
    'This is the skeleton of thousands of songs. You build it one limb at a time while the app plays the rest.',
    'Step 1: you play only the hi-hat while the app plays kick and snare. Step 2: add the kick. Step 3: everything. Count out loud the whole time. Snare is the left hand.',
    [step('Hi-hat only', 'Hi-hat quarters. The app plays the kick and snare; listen to how they fit.', P(1, { hihat: 'xxxx', kick: 'x.x.', snare: '.x.x' }), [60, 70], { lanes: ['hihat'] }),
      step('+ kick', 'Add the kick on 1 and 3. The app still plays the snare.', P(1, { hihat: 'xxxx', kick: 'x.x.', snare: '.x.x' }), [60, 70], { lanes: ['hihat', 'kick'] }),
      step('Everything', 'Hi-hat on every beat, kick 1 and 3, snare 2 and 4.', P(1, { hihat: 'xxxx', kick: 'x.x.', snare: '.x.x' }), [60, 90], { lanes: HH_K_S, pass: { maxAbsOffsetMs: 30 } })]),
  lesson(2, 'money-8ths', 'groove', 'The money beat',
    'Hi-hat 8ths, kick on 1 and 3, snare on 2 and 4.',
    'The single most useful groove in pop and rock. Get this solid and you can play along to a huge number of songs.',
    'Build it in layers: hi-hat, then add the kick, then the snare. The snare and kick always land together with a hi-hat note. Count "1 & 2 & 3 & 4 &".',
    [step('Hi-hat only', 'Hi-hat 8ths; the app plays kick and snare.', P(2, MONEY8), [60, 70], { lanes: ['hihat'] }),
      step('+ kick', 'Add the kick on 1 and 3.', P(2, MONEY8), [60, 70], { lanes: ['hihat', 'kick'] }),
      step('+ snare', 'All three limbs.', P(2, MONEY8), [60, 90], { lanes: HH_K_S }),
      step('On your own', 'The click drops out every other bar. Hold the tempo.', P(2, MONEY8, 2), [80, 100], { lanes: HH_K_S, gap: 2, pass: { maxAbsOffsetMs: 30 } })]),
  lesson(2, 'doubles', 'rudiment', 'Double strokes',
    'Two notes per hand: R R L L.',
    'Doubles lead to rolls and fast fills, and they train your weaker hand.',
    'At slow tempos play both notes with the wrist. Later the second note comes from letting the stick bounce. Keep both notes the same volume.',
    [step('8th notes', 'R R L L, count "1 & 2 &".', P(2, { snare: 'xxxxxxxx' }), [60, 100], { pass: { maxVelocityCv: 20 } }),
      step('16th notes', 'R R L L, four per beat.', P(4, { snare: 'xxxxxxxxxxxxxxxx' }), [60, 80], { pass: { maxVelocityCv: 20 } })]),
  lesson(2, 'four-floor', 'groove', 'Four on the floor',
    'Kick on every beat under the money beat.',
    'Dance, disco and lots of pop live here. It also strengthens your foot.',
    'First play only kick and snare while the app plays the hi-hat, then add the hi-hat.',
    [step('Kick and snare', 'Kick on every beat, snare on 2 and 4. The app plays the hi-hat.', P(2, { hihat: 'xxxxxxxx', kick: 'x.x.x.x.', snare: '..x...x.' }), [70, 90], { lanes: ['kick', 'snare'] }),
      step('Everything', 'Add the hi-hat 8ths.', P(2, { hihat: 'xxxxxxxx', kick: 'x.x.x.x.', snare: '..x...x.' }), [70, 110], { lanes: HH_K_S })]),
  lesson(2, 'song-steady', 'song', 'Song: Steady Eight',
    'A 16-bar tune built from the money beat, with a crash every 4 bars.',
    'Playing through a whole form, without stopping, is what playing songs feels like.',
    'Crash on 1 with the right hand instead of the hi-hat, then go straight back to the hi-hat. If you lose your place, keep the kick and snare going and join back in.',
    [step('Whole song', 'Crash on beat 1 of bars 1, 5, 9 and 13.', crashOn(P(2, MONEY8, 16), [0, 16, 32, 48]), [70, 90], { lanes: [...HH_K_S, 'crash'] })]),

  // ───────── Level 3: variations, fills, first rock song ─────────
  lesson(3, 'kick-and3', 'groove', 'Kick on the & of 3',
    'Adds a kick on the "&" after beat 3.',
    'One extra kick note makes the groove push forward. It\'s in countless rock songs.',
    'Count "1 & 2 & 3 & 4 &" and put the extra kick exactly on the "&" of 3. The hi-hat keeps going over it.',
    [step('Kick and hi-hat', 'App plays the snare.', P(2, { ...MONEY8, kick: 'x...xx..' }), [60, 80], { lanes: ['hihat', 'kick'] }),
      step('Everything', 'Full groove.', P(2, { ...MONEY8, kick: 'x...xx..' }), [70, 110], { lanes: HH_K_S })]),
  lesson(3, 'kick-vars', 'groove', 'More kick variations',
    'Kick on the & of 1, then on the & of 4.',
    'Moving one kick note gives you a whole family of grooves from one pattern.',
    'Lock the hands first; the foot is the only thing that changes.',
    [step('& of 1', 'Kick on 1, & of 1, and 3.', P(2, { ...MONEY8, kick: 'xx..x...' }), [70, 100], { lanes: HH_K_S }),
      step('& of 4', 'Kick on 1, 3 and the & of 4.', P(2, { ...MONEY8, kick: 'x...x..x' }), [70, 100], { lanes: HH_K_S })]),
  lesson(3, 'open-and4', 'groove', 'Open hi-hat on the & of 4',
    'Lift the hi-hat pedal for one note at the end of the bar.',
    'An open hi-hat "breath" is a classic rock sound and trains your hi-hat foot.',
    'Keep the pedal down, lift it just before the "&" of 4, hit the open hi-hat, then press the pedal back down on beat 1. The ring (○) on the highway means open.',
    [step('Hi-hat only', 'Closed, closed… open on the & of 4.', P(2, { hihat: 'xxxxxxx.', hhOpen: '.......x', kick: 'x...x...', snare: '..x...x.' }), [60, 80], { lanes: ['hihat', 'hhOpen'] }),
      step('Everything', 'Full groove with the open hi-hat.', P(2, { hihat: 'xxxxxxx.', hhOpen: '.......x', kick: 'x...x...', snare: '..x...x.' }), [70, 100], { lanes: ['hihat', 'hhOpen', 'kick', 'snare'] })], ['rock']),
  lesson(3, 'crash-phrase', 'groove', 'Four-bar phrase',
    'Crash on beat 1, then three bars of groove.',
    'Songs move in 4- and 8-bar phrases. Marking the start with a crash helps the band, and you, keep your place.',
    'Count the bars: "ONE 2 3 4, TWO 2 3 4…". Crash with the kick on 1, then back to the hi-hat.',
    [step('Crash on 1', 'Crash on 1 of the first bar, then groove.', crashOn(P(2, MONEY8, 4), [0]), [80, 110], { lanes: [...HH_K_S, 'crash'] })]),
  lesson(3, 'fill-8ths', 'fill', 'Your first fill',
    '8th notes down the toms: snare, tom 1, tom 2, floor tom.',
    'Fills mark the end of a section. This one fits almost anywhere.',
    'Step 1 is the fill alone. Step 2 puts it after three bars of groove; land on beat 1 with a crash. Keep the 8ths even as you move around: arms move, not the timing.',
    [step('Fill alone', 'Two notes on each drum, R L.', P(2, FILL8), [60, 90]),
      step('Groove + fill', 'Three bars of groove, the fill, then crash on 1.', cat([crashOn(P(2, MONEY8, 3), [0]), P(2, FILL8), crashOn(P(2, MONEY8), [0])]), [70, 100])]),
  lesson(3, 'fill-16-snare', 'fill', 'Snare 16ths fill',
    'Groove, then the last two beats as 16ths on the snare.',
    'Short fills keep the groove going while still marking the phrase.',
    'R L R L. Start the 16ths right on beat 3 and come back to the groove on 1.',
    [step('Groove + fill', 'Bar 1 groove, bar 2: groove for two beats, then 16ths.', cat([P(2, MONEY8), P(4, { hihat: 'x.x.x.x.', kick: 'x.......', snare: '....x...xxxxxxxx' })]), [70, 100])]),
  lesson(3, 'song-garage', 'song', 'Song: Garage Eight',
    'A 24-bar rock tune: verse, chorus, verse, with fills.',
    'Puts together everything from levels 2 and 3 in a real song form.',
    'Verse is the money beat with the & of 3 kick. Chorus is four on the floor. Each section ends with a fill and starts with a crash.',
    [step('Whole song', 'Verse (8) · chorus (8) · verse (8).', cat([
      crashOn(P(2, { ...MONEY8, kick: 'x...xx..' }, 7), [0]), P(2, FILL8),
      crashOn(P(2, { hihat: 'xxxxxxxx', kick: 'x.x.x.x.', snare: '..x...x.' }, 7), [0]), P(4, { hihat: 'x.x.x.x.', kick: 'x.......', snare: '....x...xxxxxxxx' }),
      crashOn(P(2, { ...MONEY8, kick: 'x...xx..' }, 7), [0]), P(2, FILL8),
    ]), [80, 100])]),

  // ───────── Level 4: 16ths, paradiddle, ghost notes ─────────
  lesson(4, 'paradiddle', 'rudiment', 'The paradiddle',
    'R L R R  L R L L, accent the first note of each group.',
    'Paradiddles teach your hands to switch lead. They show up in grooves and fills everywhere.',
    'Say the sticking out loud: "R L R R, L R L L". Accent only the first note. Start slow enough that you never stop.',
    [step('8th notes', 'R L R R L R L L, accent the first of each four.', P(2, { snare: 'XxxxXxxx' }), [60, 90], { pass: { maxGhostToAccent: 0.8 } }),
      step('16th notes', 'Same sticking, twice as fast.', P(4, { snare: 'XxxxXxxxXxxxXxxx' }), [60, 80], { pass: { maxGhostToAccent: 0.8 } })]),
  lesson(4, 'hh-16ths', 'groove', '16th-note hi-hat',
    'One hand playing 16ths on the hi-hat over kick and snare.',
    'Busier hi-hats give ballads and pop grooves a smooth, driving feel.',
    'Count "1 e & a". Keep the hi-hat light so you can go faster.',
    [step('Hi-hat only', 'App plays kick and snare.', P(4, { hihat: 'xxxxxxxxxxxxxxxx', kick: 'x.......x.......', snare: '....x.......x...' }), [50, 70], { lanes: ['hihat'] }),
      step('Everything', 'Full groove.', P(4, { hihat: 'xxxxxxxxxxxxxxxx', kick: 'x.......x.......', snare: '....x.......x...' }), [55, 85], { lanes: HH_K_S })]),
  lesson(4, 'kick-16ths', 'groove', 'Kick on the "a" of 2',
    'A kick on the last 16th before beat 3.',
    'Syncopated kick notes are the step from beginner to funky.',
    'Count 16ths quietly: "2 e & A 3". The kick on "a" leads straight into the kick on 3.',
    [step('Everything', 'Kick 1, a of 2, 3.', P(4, { hihat: 'x.x.x.x.x.x.x.x.', kick: 'x......xx.......', snare: '....x.......x...' }), [60, 100], { lanes: HH_K_S })]),
  lesson(4, 'ghost-notes', 'groove', 'Ghost notes',
    'Very quiet snare notes between the loud backbeats.',
    'Ghost notes are what make funk and R&B grooves feel alive.',
    'Accents from about 30 cm, ghosts from 2–3 cm. The ghosts should be felt more than heard. This needs the real kit: the keyboard can\'t play soft enough.',
    [step('Snare only', 'Accent on 2 and 4, ghosts in between.', P(4, { snare: '....X..g.g..X..g' }), [60, 80], { pass: { maxGhostToAccent: 0.6 } }),
      step('Full groove', 'With hi-hat 8ths and kick.', P(4, { hihat: 'x.x.x.x.x.x.x.x.', snare: '....X..g.g..X..g', kick: 'x.x....x..x.....' }), [60, 85], { lanes: HH_K_S, pass: { maxGhostToAccent: 0.6 } })], ['funk']),
  lesson(4, 'open-hats', 'groove', 'Open hi-hat on every &',
    'Closed on the beat, open on the "&": the disco hi-hat.',
    'A great workout for the hi-hat foot and an instantly recognisable sound.',
    'Pedal down on the numbers, up on the "&". Foot and hand work like a seesaw. Start with the app playing kick and snare.',
    [step('Hi-hat only', 'Closed on numbers, open on &.', P(2, { hihat: 'x.x.x.x.', hhOpen: '.x.x.x.x', kick: 'x.x.x.x.', snare: '..x...x.' }), [60, 80], { lanes: ['hihat', 'hhOpen'] }),
      step('Everything', 'Kick on every beat, snare 2 and 4.', P(2, { hihat: 'x.x.x.x.', hhOpen: '.x.x.x.x', kick: 'x.x.x.x.', snare: '..x...x.' }), [70, 110], { lanes: ['hihat', 'hhOpen', 'kick', 'snare'] })], ['rock', 'funk']),
  lesson(4, 'ride-groove', 'groove', 'Ride groove with hi-hat foot',
    'Right hand on the ride, hi-hat pedal on 2 and 4.',
    'The ride opens up the sound for choruses, and the foot "chick" brings in a fourth limb.',
    'First play hands and kick while the app plays the hi-hat foot. Then add the foot on 2 and 4 with the snare.',
    [step('Without the foot', 'Ride 8ths, kick 1 and 3, snare 2 and 4.', P(2, { ride: 'xxxxxxxx', kick: 'x...x...', snare: '..x...x.', hhPedal: '..x...x.' }), [70, 100], { lanes: ['ride', 'kick', 'snare'] }),
      step('All four limbs', 'Add the hi-hat pedal on 2 and 4.', P(2, { ride: 'xxxxxxxx', kick: 'x...x...', snare: '..x...x.', hhPedal: '..x...x.' }), [70, 100], { lanes: ['ride', 'kick', 'snare', 'hhPedal'] })]),
  lesson(4, 'singles-toms', 'rudiment', 'Singles around the toms',
    '16th notes moving snare, tom 1, tom 2, floor tom.',
    'Moving smoothly around the kit is the core skill behind every fill.',
    'Lead with the right hand on each new drum. Move early: the arm travels, the timing doesn\'t change.',
    [step('Around the kit', 'Four notes on each drum.', P(4, { snare: 'xxxx............', tom1: '....xxxx........', tom2: '........xxxx....', floor: '............xxxx' }), [60, 90])]),

  // ───────── Level 5: triplets, shuffle, half-time, funk, 6/8 ─────────
  lesson(5, 'triplets', 'rudiment', 'Triplets',
    'Three even notes per beat: "1 trip let 2 trip let".',
    'Triplets are the basis of shuffles, 6/8 and swing.',
    'Alternate hands; the lead switches every beat. Accent the first of each three in step 2.',
    [step('Even triplets', 'R L R L R L…, count "1 trip let".', P(3, { snare: 'xxxxxxxxxxxx' }), [60, 90]),
      step('Accent the beat', 'Loud on each number.', P(3, { snare: 'XxxXxxXxxXxx' }), [60, 90], { pass: { maxGhostToAccent: 0.8 } })]),
  lesson(5, 'shuffle', 'groove', 'The shuffle',
    'Hi-hat on the first and last note of each triplet.',
    'Blues, rock\'n\'roll and lots of classic rock swing like this.',
    'Think triplets, but skip the middle one: "1 - let 2 - let". It should sound like a lopsided gallop.',
    [step('Hi-hat only', 'App plays kick and snare.', P(3, SHUFFLE), [60, 80], { lanes: ['hihat'] }),
      step('Everything', 'Full shuffle.', P(3, SHUFFLE), [60, 100], { lanes: HH_K_S })], ['rock']),
  lesson(5, 'half-time', 'groove', 'Half-time feel',
    'Snare only on beat 3; kick on 1.',
    'Same tempo, but the groove feels twice as slow and heavy. Great for big choruses.',
    'Leave lots of space. Hit the snare with full confidence on 3.',
    [step('Half-time', 'Hi-hat 8ths, kick on 1, snare on 3.', P(2, { hihat: 'xxxxxxxx', kick: 'x.......', snare: '....x...' }), [70, 100], { lanes: HH_K_S })]),
  lesson(5, 'funk-1', 'groove', 'Funk groove',
    'Syncopated kick with ghost notes on the snare.',
    'Brings together 16th kicks, accents and ghosts.',
    'Layer it: hands first with the app on kick, then everything.',
    [step('Hands only', 'Hi-hat and snare; the app plays the kick.', P(4, { hihat: 'x.x.x.x.x.x.x.x.', snare: '....X..g.g..X..g', kick: 'x.x....x..x.....' }), [60, 80], { lanes: ['hihat', 'snare'] }),
      step('Everything', 'Full groove.', P(4, { hihat: 'x.x.x.x.x.x.x.x.', snare: '....X..g.g..X..g', kick: 'x.x....x..x.....' }), [65, 95], { lanes: HH_K_S })], ['funk']),
  lesson(5, 'six-eight', 'groove', '6/8 groove',
    'Six 8th notes per bar, snare on 4.',
    'Ballads and many slow songs are in 6/8. It feels like two big beats, each split in three.',
    'Count "1 2 3 4 5 6" with a lean on 1 and 4. Tempo here is for the dotted beat, so it feels slower than the number.',
    [step('6/8', 'Hi-hat 8ths, kick on 1, snare on 4.', P(2, { hihat: 'xxxxxx', kick: 'x.....', snare: '...x..' }), [40, 60], { lanes: HH_K_S, ts: [6, 8] })], ['rock']),
  lesson(5, 'triplet-fill', 'fill', 'Triplet fill',
    'Triplets down the toms.',
    'A rolling fill that fits shuffles and slow rock.',
    'Three notes per drum, R L R then L R L. Land on 1 with a crash.',
    [step('Fill alone', 'Snare, tom 1, tom 2, floor tom.', P(3, TRIP_FILL), [60, 85]),
      step('Shuffle + fill', 'Bar of shuffle, then the fill.', cat([P(3, SHUFFLE), P(3, TRIP_FILL), crashOn(P(3, SHUFFLE), [0])]), [60, 90])], ['rock']),
  lesson(5, 'song-shuffle', 'song', 'Song: Roadhouse Shuffle',
    'Two times through a 12-bar blues.',
    'The 12-bar blues is the most played song form in rock and blues jams.',
    'Crash every 4 bars. Bar 12 is a triplet fill that leads back to the top.',
    [step('Whole song', '12-bar blues, twice.', cat([
      crashOn(P(3, SHUFFLE, 4), [0]), crashOn(P(3, SHUFFLE, 4), [0]), crashOn(P(3, SHUFFLE, 3), [0]), P(3, TRIP_FILL),
      crashOn(P(3, SHUFFLE, 4), [0]), crashOn(P(3, SHUFFLE, 4), [0]), crashOn(P(3, SHUFFLE, 3), [0]), P(3, TRIP_FILL),
    ]), [70, 92])]),

  // ───────── Level 6: jazz ─────────
  lesson(6, 'jazz-ride', 'groove', 'Jazz ride pattern',
    'The "spang-a-lang" on the ride with the hi-hat foot on 2 and 4.',
    'The foundation of swing. Everything else in jazz drumming hangs off this.',
    'Ride on every beat plus the last triplet of 2 and 4. The foot "chicks" on 2 and 4. Keep it light and flowing.',
    [step('Ride only', 'App plays the hi-hat foot.', P(3, JAZZ), [80, 120], { lanes: ['ride'] }),
      step('+ foot', 'Ride and hi-hat pedal.', P(3, JAZZ), [80, 120], { lanes: ['ride', 'hhPedal'] })], ['jazz']),
  lesson(6, 'feathered-kick', 'groove', 'Feathered kick',
    'Very soft kick on every beat under the ride.',
    'Gives swing a bottom you feel rather than hear.',
    'Barely touch the kick pedal; the bass player should hear it, the audience shouldn\'t.',
    [step('Ride, foot, kick', 'Soft kick on every beat.', P(3, { ...JAZZ, kick: 'g..g..g..g..' }), [80, 120], { lanes: ['ride', 'hhPedal', 'kick'] })], ['jazz']),
  lesson(6, 'comping', 'groove', 'Snare comping',
    'Snare notes on the "let" of 2 and 4.',
    'Comping is the drummer\'s conversation with the band.',
    'Left hand only. Keep the ride steady and drop the snare in between.',
    [step('Comp on the lets', 'Add snare on the last triplet of 2 and 4.', P(3, { ...JAZZ, snare: '.....x.....x' }), [80, 120], { lanes: ['ride', 'hhPedal', 'snare'] })], ['jazz']),
  lesson(6, 'song-swing', 'song', 'Song: Medium Swing',
    'A 16-bar swing tune with comping and crashes.',
    'Swing time for a whole form, with small variations.',
    'Crash with the kick on 1 of bars 1 and 9. Comp changes every 4 bars.',
    [step('Whole song', '16 bars of swing.', cat([
      crashOn(P(3, { ...JAZZ, snare: '.....x.....x' }, 4), [0]), P(3, { ...JAZZ, snare: '..x.....x...' }, 4),
      crashOn(P(3, { ...JAZZ, snare: '.....x.....x' }, 4), [0]), P(3, { ...JAZZ, snare: '..x..x..x..x' }, 4),
    ]), [100, 130])], ['jazz']),
];

export const LESSON_BY_ID = Object.fromEntries(CURRICULUM.map(l => [l.id, l])) as Record<string, Lesson>;

export const MILESTONES: Milestone[] = [
  { level: 0, title: 'Ready to play', rank: 'Stick Rookie', checkpoints: ['count-8ths', 'rests'],
    canDo: ['Sit and hold the sticks so they bounce', 'Count quarters and 8ths out loud while playing', 'Count through rests without rushing'] },
  { level: 1, title: 'Every limb on its own', rank: 'Limb Wrangler', checkpoints: ['singles', 'hh-8ths', 'hands-feet'],
    canDo: ['Even single strokes at 100 BPM 8ths', 'Hi-hat 8ths with the pedal down, also with a gap click', 'Hand and foot landing together'] },
  { level: 2, title: 'The money beat', rank: 'Groove Keeper', checkpoints: ['money-8ths', 'song-steady'],
    canDo: ['Play the money beat at 100 BPM, holding time without the click', 'Play a 16-bar song with crashes without stopping'] },
  { level: 3, title: 'Variations and first fills', rank: 'Fill Maker', checkpoints: ['kick-and3', 'fill-8ths', 'song-garage'],
    canDo: ['Move the kick around under a steady groove', 'Play a fill and land on 1 with a crash', 'Play a 24-bar rock song'] },
  { level: 4, title: '16ths and dynamics', rank: 'Dynamics Boss', checkpoints: ['paradiddle', 'hh-16ths', 'ghost-notes', 'ride-groove'],
    canDo: ['Paradiddles with clear accents', '16th-note grooves', 'Ghost notes that are really quiet', 'Grooves on the ride with the hi-hat foot'] },
  { level: 5, title: 'Triplet feels', rank: 'Triplet Traveller', checkpoints: ['triplets', 'shuffle', 'half-time', 'song-shuffle'],
    canDo: ['Even triplets', 'A shuffle that swings', 'Half-time feel', 'A 12-bar blues'] },
  { level: 6, title: 'Swing', rank: 'Swing Cat', checkpoints: ['jazz-ride', 'comping', 'song-swing'],
    canDo: ['The jazz ride pattern with the foot on 2 and 4', 'Comping on the snare', 'A 16-bar swing tune'] },
];
