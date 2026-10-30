// Pure layout math for the kit's drawn parts (no React Native): the progress ring and the stage trail.

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * A progress ring drawn with two half-discs (React Native has no conic gradient): the right half shows the first
 * 180°, the left half the rest. `right` and `left` are the clockwise rotations, in degrees, of each half's fill.
 */
export function ringAngles(fraction: number): { right: number; left: number } {
  const deg = clamp01(fraction) * 360;
  return { right: Math.min(180, deg), left: Math.max(0, deg - 180) };
}

/** "5/16" → 5 / 16 as a ring fraction (0 when there is nothing to fill). */
export const ratio = (value: number, max: number) => (max > 0 ? clamp01(value / max) : 0);

export type TrailGeometry = {
  /** Each stop's centre, from the left edge (pt). */
  centers: number[];
  /** The solid (done) bar: from the first stop's centre to `reached`'s centre; width 0 when nothing is reached. */
  done: { x: number; width: number };
  /** The dashed rest of the line, one entry per dash. */
  dashes: { x: number; width: number }[];
};

/** The mockup's dashed line: 7 pt dashes with 6 pt gaps (repeating-linear-gradient 0 7px, transparent 7px 13px). */
export const DASH = 7, DASH_GAP = 6;

/**
 * The stage trail across `width`: `count` stops in equal columns, the line from the first centre to the last, solid
 * up to stop `reached` (the stop you're on, or the last done one; -1 = none), dashed after it.
 */
export function trailGeometry(width: number, count: number, reached: number): TrailGeometry {
  if (count <= 0 || !(width > 0)) return { centers: [], done: { x: 0, width: 0 }, dashes: [] };
  const col = width / count;
  const centers = Array.from({ length: count }, (_, i) => col * (i + 0.5));
  const first = centers[0], last = centers[count - 1];
  const r = Math.min(count - 1, Math.floor(reached));
  const doneTo = r >= 0 ? centers[r] : first;
  const dashes: { x: number; width: number }[] = [];
  for (let x = doneTo; x < last; x += DASH + DASH_GAP) dashes.push({ x, width: Math.min(DASH, last - x) });
  return { centers, done: { x: first, width: doneTo - first }, dashes };
}
