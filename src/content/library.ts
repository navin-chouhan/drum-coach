import { pattern, type Chart } from '../engine/chart.ts';
import { LESSON_BY_ID } from './curriculum.ts';

const C = (c: Chart & { id: string }) => c;
const g44 = [4, 4] as [number, 4];

/** Built-in exercises. Steps: 4 per beat (16ths) unless noted. */
export const LIBRARY: (Chart & { id: string })[] = [
  C({ id: 'rock-8ths', title: 'Basic rock beat', kind: 'groove', level: 2, bpm: 80, timeSignature: g44, bars: 4,
    description: 'Hi-hat 8ths, snare on 2 and 4, kick on 1 and 3.',
    notes: pattern({ hihat: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', kick: 'x.......x.......' }, 4, 4) }),
  C({ id: 'rock-kick-var', title: 'Rock beat, busier kick', kind: 'groove', level: 3, bpm: 85, timeSignature: g44, bars: 4,
    description: 'Adds the kick on the "and" of 3.',
    notes: pattern({ hihat: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', kick: 'x.......x.x.....' }, 4, 4) }),
  C({ id: 'ride-pedal', title: 'Ride groove with hi-hat foot', kind: 'groove', level: 4, bpm: 90, timeSignature: g44, bars: 4,
    description: 'Ride 8ths, hi-hat pedal on 2 and 4, crash on the first beat.',
    notes: [{ t: 0, drum: 'crash' as const }, ...pattern({ ride: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', kick: 'x.....x.x.......', hhPedal: '....x.......x...' }, 4, 4)]
      .filter(n => !(n.t === 0 && n.drum === 'ride')) }),
  C({ id: 'disco', title: 'Disco (four on the floor)', kind: 'groove', level: 2, bpm: 100, timeSignature: g44, bars: 4,
    description: 'Kick on every beat, open hi-hat on the off-beats.',
    notes: pattern({ hihat: 'x...x...x...x...', hhOpen: '..x...x...x...x.', snare: '....x.......x...', kick: 'x...x...x...x...' }, 4, 4) }),
  C({ id: 'funk-ghosts', title: 'Funk groove with ghost notes', kind: 'groove', level: 4, bpm: 80, timeSignature: g44, bars: 4,
    description: 'Accented backbeat, quiet ghost notes on the snare.',
    notes: pattern({ hihat: 'x.x.x.x.x.x.x.x.', snare: '....X..g.g..X..g', kick: 'x.x....x..x.....' }, 4, 4) }),
  C({ id: 'shuffle-68', title: 'Straight 6/8 groove', kind: 'groove', level: 5, bpm: 60, timeSignature: [6, 8], bars: 4,
    description: 'Hi-hat 8ths in 6/8, snare on 4.',
    notes: pattern({ hihat: 'xxxxxx', snare: '...x..', kick: 'x.....' }, 2, 4) }),
  C({ id: 'singles', title: 'Single strokes (16ths)', kind: 'rudiment', level: 1, bpm: 70, timeSignature: g44, bars: 2,
    description: 'Even 16ths on the snare, alternating hands (R L R L).',
    notes: pattern({ snare: 'xxxxxxxxxxxxxxxx' }, 4, 2) }),
  C({ id: 'accent-8ths', title: 'Accents on the beat', kind: 'rudiment', level: 1, bpm: 80, timeSignature: g44, bars: 2,
    description: '8ths on the snare: loud on the beat, soft off the beat.',
    notes: pattern({ snare: 'XgXgXgXg' }, 2, 2) }),
  C({ id: 'paradiddle', title: 'Paradiddle accents', kind: 'rudiment', level: 4, bpm: 70, timeSignature: g44, bars: 2,
    description: 'R L R R  L R L L — accent the first note of each group.',
    notes: pattern({ snare: 'XxxxXxxxXxxxXxxx' }, 4, 2) }),
  C({ id: 'singles-toms', title: 'Singles around the toms', kind: 'rudiment', level: 4, bpm: 75, timeSignature: g44, bars: 2,
    description: '16ths moving snare → tom 1 → tom 2 → floor tom.',
    notes: pattern({ snare: 'xxxx............', tom1: '....xxxx........', tom2: '........xxxx....', floor: '............xxxx' }, 4, 2) }),
  C({ id: 'fill-toms', title: 'Groove + tom fill', kind: 'fill', level: 3, bpm: 85, timeSignature: g44, bars: 4,
    description: 'Crash, three bars of rock beat, then an 8th-note fill down the toms.',
    notes: [
      { t: 0, drum: 'crash' as const },
      ...pattern({ hihat: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', kick: 'x.......x.......' }, 4, 3).filter(n => !(n.t === 0 && n.drum === 'hihat')),
      ...pattern({ snare: 'x.x.', tom1: '....x.x.', tom2: '........x.x.', floor: '............x.x.', kick: 'x...............' }, 4, 1, 12),
    ].sort((a, b) => a.t - b.t) }),
  C({ id: 'fill-snare16', title: 'Snare 16ths fill', kind: 'fill', level: 3, bpm: 80, timeSignature: g44, bars: 2,
    description: 'One bar of groove, then the last two beats as 16ths on the snare.',
    notes: [
      ...pattern({ hihat: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', kick: 'x.......x.......' }, 4, 1),
      ...pattern({ hihat: 'x.x.x.x.', snare: '....x...xxxxxxxx', kick: 'x.......' }, 4, 1, 4),
    ].sort((a, b) => a.t - b.t) }),
  // From the path (G3): a chart from each stage's lessons, so Practice has 3+ per level and always a step up.
  ...([
    ['quarters-snare', 'count-quarters', 'Quarter notes on the snare'], ['8ths-count', 'count-8ths', 'Counting 8th notes'], ['rests', 'rests', 'Rests are notes too'],
    ['hh-8ths', 'hh-8ths', 'Hi-hat 8th notes'], ['first-beat', 'money-quarters', 'Your first beat'],
    ['shuffle', 'shuffle', 'The shuffle'], ['half-time', 'half-time', 'Half-time feel'], ['triplet-fill', 'triplet-fill', 'Triplet fill'],
    ['jazz-ride', 'jazz-ride', 'Jazz ride pattern'], ['comping', 'comping', 'Snare comping'], ['feathered-kick', 'feathered-kick', 'Feathered kick'],
    ['kick-16-indep', 'kick-16-indep', '16th kicks under 8ths'], ['funk-96', 'funk-at-tempo', 'Funk at tempo'], ['open-hat-funk', 'open-hat-funk', 'Open-hat funk'],
    ['linear-groove', 'linear-groove', 'A linear groove'], ['five-four', 'five-four', 'Five-four groove'], ['seven-eight', 'seven-eight', 'Seven-eight groove'],
    ['fill-vocab', 'fill-vocab', 'Groove and a fill'], ['fills-build', 'fills-build', 'A fill that builds'], ['linear-fill', 'linear-fill', 'Linear fill'], ['spotlight', 'song-spotlight', 'Spotlight (song)'],
  ] as const).map(([id, lessonId, title]) => {
    const l = LESSON_BY_ID[lessonId], c = l.steps[l.steps.length - 1].chart;
    return C({ ...c, id, title, kind: l.kind === 'exercise' ? 'rudiment' : l.kind, level: l.level, description: l.what, bpm: l.steps[l.steps.length - 1].bpm.target });
  }),
];
