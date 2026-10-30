import { seededRandom } from './kitEmulator.ts';

// Graded sight-reading (N7): fresh one-bar rhythm cards per grade, built from common one-beat cells so they read
// like real music. Grade 1 quarters, 2 8ths, 3 8ths with the kick, 4 16ths, 5 triplets.
const CELLS: Record<number, { spb: number; cells: string[] }> = {
  1: { spb: 1, cells: ['x', 'x', '.'] },
  2: { spb: 2, cells: ['x.', 'xx', 'xx', '.x', 'x.'] },
  3: { spb: 2, cells: ['x.', 'xx', '.x', 'x.'] },
  4: { spb: 4, cells: ['x...', 'x.x.', 'xxxx', 'x.xx', 'xx.x', 'xxx.', '..x.', 'x...'] },
  5: { spb: 3, cells: ['x..', 'xxx', 'x.x', 'xx.', 'x..'] },
};
export const SIGHT_GRADES = [1, 2, 3, 4, 5] as const;

/** `n` different cards of a grade (pattern lines for `pattern()`), the same for the same seed. */
export function sightCards(grade: number, n: number, seed: number): { spb: number; lines: { snare: string; kick?: string } }[] {
  const { spb, cells } = CELLS[grade] ?? CELLS[1], rnd = seededRandom(seed), out = new Map<string, { snare: string; kick?: string }>();
  for (let tries = 0; out.size < n && tries < n * 50; tries++) {
    const snare = Array.from({ length: 4 }, () => cells[Math.floor(rnd() * cells.length)]).join('');
    if ((snare.match(/x/g) ?? []).length < 3 || snare[0] !== 'x' && grade < 3) continue; // a clear downbeat for the early grades
    // grade 3: the kick plays some of the empty steps (two voices to read, never together)
    const kick = grade === 3 ? [...snare].map((c, i) => (c === '.' && (i % 2 === 0 || rnd() < 0.4) ? 'x' : '.')).join('') : undefined;
    if (kick && !kick.includes('x')) continue;
    out.set(snare + (kick ?? ''), { snare, ...(kick && { kick }) });
  }
  return [...out.values()].map(lines => ({ spb, lines }));
}
