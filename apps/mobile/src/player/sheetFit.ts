// The sheet's zoom for the paper it has: NotationView's iPad zoom (1.6) needs about 300 pt for one line with the count
// and hand rows under it; a shorter paper zooms down (not below 1.1, NotationView's narrow zoom) so nothing is clipped.
// Used by the shared player's screens (lesson, placement, Practice, Songs) (both measure the paper with onLayout). Pure.

/** The paper height (pt) one line of the sheet needs at NotationView's 1.6 zoom. */
export const SHEET_H_AT_1_6 = 300;

/** The zoom for a paper `height` pt tall; undefined until it's measured (NotationView then picks its own). */
export function sheetScaleFor(height: number): number | undefined {
  if (!(height > 0)) return undefined;
  return Math.max(1.1, Math.min(1.6, Math.round(((1.6 * height) / SHEET_H_AT_1_6) * 100) / 100));
}
