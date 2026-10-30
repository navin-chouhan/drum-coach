// Odd meters (R3): a bar of 5/8 or 7/8 is felt in groups of 8th notes (3+2, 2+2+3), not in quarter beats.

type TS = readonly [number, number];
/** An odd /8 meter (5/8, 7/8, 11/8…): counted and clicked in 8th notes. 6/8, 9/8 and 12/8 stay in dotted beats. */
export const isOdd8 = (ts: TS) => ts[1] === 8 && ts[0] % 3 !== 0;
/** The bar's groups of 8ths: 5/8 = 3+2, 7/8 = 2+2+3, compound meters in 3s, others in 2s with a 3 at the end. */
export function groupsOf(ts: TS): number[] {
  if (ts[1] !== 8) return Array(ts[0]).fill(1);
  if (ts[0] === 5) return [3, 2];
  if (ts[0] % 3 === 0) return Array(ts[0] / 3).fill(3);
  const twos = Array((ts[0] - 3) / 2).fill(2);
  return [...twos, 3];
}
/** 8th-note positions in the bar where a group starts (0 = the downbeat): 7/8 → 0, 2, 4. */
export function groupStarts(ts: TS): Set<number> {
  const out = new Set<number>();
  let at = 0;
  for (const n of groupsOf(ts)) { out.add(at); at += n; }
  return out;
}
