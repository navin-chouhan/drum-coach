// Charts for app/dev/sheet.tsx and the notation tests: the mockups' "The money beat" (src/play/dev/fixture.ts) and a
// busier groove that uses every mark the sheet draws (accent, ghost, open hi-hat, flam, buzz, triplet fill, crash,
// hi-hat foot, app-played notes).
import type { ChartLike, ChartNoteLike } from '../../play/chartLike';

export { moneyBeat } from '../../play/dev/fixture';

export function markShowcase(bpm = 80): ChartLike {
  const notes: ChartNoteLike[] = [];
  const push = (t: number, drum: ChartNoteLike['drum'], extra: Partial<ChartNoteLike> = {}) => notes.push({ t, drum, ...extra });
  // Bar 1: hi-hat 8ths with an open one on the "&" of 4, snare on 2 (accent) and 4, a ghost on the "a" of 2, kick 1 and 3.
  for (let e = 0; e < 8; e++) push(e / 2, e === 7 ? 'hhOpen' : 'hihat');
  push(0, 'kick'); push(2, 'kick'); push(2.5, 'kick');
  push(1, 'snare', { accent: true }); push(1.75, 'snare', { ghost: true }); push(3, 'snare');
  // Bar 2: crash on 1, ride quarters, a flam on 2, a buzz on 4, hi-hat foot on 2 and 4, the app plays the kick.
  push(4, 'crash'); push(4, 'kick', { auto: true });
  for (let q = 1; q < 4; q++) push(4 + q, 'ride');
  push(5, 'snare', { grace: 1 }); push(7, 'snare', { buzz: true });
  push(5, 'hhPedal'); push(7, 'hhPedal'); push(6, 'kick', { auto: true });
  // Bar 3: 16ths on the snare (R L R L) with the kick on 1 and 3.
  for (let s = 0; s < 16; s++) push(8 + s / 4, 'snare', { stick: s % 2 ? 'L' : 'R' });
  push(8, 'kick'); push(10, 'kick');
  // Bar 4: a triplet fill down the toms, then a crash and kick on the next downbeat's place (beat 4).
  const fill: ChartNoteLike['drum'][] = ['tom1', 'tom1', 'tom2', 'tom2', 'floor', 'floor', 'snare', 'snare', 'snare'];
  fill.forEach((d, k) => push(12 + k / 3, d));
  push(15, 'crash', { accent: true }); push(15, 'kick');
  notes.sort((a, b) => a.t - b.t);
  return { title: 'Every mark', bpm, timeSignature: [4, 4], bars: 4, notes };
}
