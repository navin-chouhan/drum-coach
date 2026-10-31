// How big "How it moves" draws (TechniqueDom.tsx): the drawing takes the room its controls and words leave, keeping
// its shape. Pure, so it is tested in Node (a 'use dom' file exports only its component).

/** The drawing area never shrinks below this (pixels): with long words it scrolls instead. */
export const MIN_AREA = 160;
/** The gap between the two grip drawings (side and above). */
export const PAIR_GAP = 10;
/** Room for the stage's hard shadow (5 px right and down). */
export const SHADOW = 5;

/**
 * The size of each drawing in an area `w`×`h` (pixels) holding `n` of them side by side: as wide as fits and no taller
 * than the area, keeping the drawing's shape (`ratio` = height / width), never 0. Null until the area is measured
 * (the stage then keeps its shape with the padding-top ratio).
 */
export function fitStage(w: number, h: number, n: number, ratio: number): { w: number; h: number } | null {
  if (!(w > 0) || !(h > 0) || !(ratio > 0) || !(n >= 1)) return null;
  const per = (w - SHADOW - PAIR_GAP * (n - 1)) / n;
  const sw = Math.max(1, Math.min(per, (Math.max(h, MIN_AREA) - SHADOW) / ratio));
  return { w: Math.floor(sw), h: Math.max(1, Math.floor(sw * ratio)) };
}
