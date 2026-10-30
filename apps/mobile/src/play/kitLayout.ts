// Where the drums sit in the kit view and on the touch pads, as seen from the throne (the MPS-150: crash, toms and ride
// on top, hi-hat left, snare, kick and floor below). Pure TypeScript (Vitest-tested). Layouts are in design units and
// scaled to fit, keeping their aspect.
import type { DrumId } from './chartLike';

/** A drum, or the hi-hat pedal (which has its own strip on the touch pads). */
export type KitPartId = DrumId | 'hhPedal';

export type KitPart =
  | { id: KitPartId; drum: DrumId; label: string; kind: 'circle'; cx: number; cy: number; r: number }
  | { id: KitPartId; drum: DrumId; label: string; kind: 'rect'; cx: number; cy: number; w: number; h: number; radius: number };

export type KitLayout = { width: number; height: number; parts: KitPart[] };

const circle = (id: DrumId, label: string, cx: number, cy: number, r: number): KitPart => ({ id, drum: id, label, kind: 'circle', cx, cy, r });

/** The small kit beside the highway (docs/mockups/ipad/lesson-take.html, 344 × 152). */
export const MINI_KIT: KitLayout = {
  width: 344, height: 152,
  parts: [
    circle('crash', 'Crash', 70, 34, 30), circle('hihat', 'Hi-hat', 40, 98, 33), circle('tom1', 'Tom 1', 140, 46, 24),
    circle('tom2', 'Tom 2', 196, 46, 24), circle('ride', 'Ride', 296, 40, 34), circle('snare', 'Snare', 112, 112, 32),
    circle('floor', 'Floor', 262, 112, 32),
    { id: 'kick', drum: 'kick', label: 'Kick', kind: 'rect', cx: 191, cy: 127, w: 62, h: 38, radius: 10 },
  ],
};

/**
 * The multi-touch kit (docs/mockups/ipad/touch-pads.html, 1194 × 436). The hi-hat pedal strip is 56 high (the mockup
 * has 44) so it stays at least 44 pt when the area shrinks.
 */
export const TOUCH_KIT: KitLayout = {
  width: 1194, height: 436,
  parts: [
    circle('crash', 'Crash', 168, 92, 70), circle('hihat', 'Hi-hat', 150, 262, 96), circle('tom1', 'Tom 1', 470, 96, 70),
    circle('tom2', 'Tom 2', 650, 96, 70), circle('ride', 'Ride', 1030, 108, 92), circle('snare', 'Snare', 400, 292, 104),
    circle('floor', 'Floor tom', 900, 300, 100),
    { id: 'kick', drum: 'kick', label: 'Kick', kind: 'rect', cx: 660, cy: 360, w: 200, h: 120, radius: 26 },
    { id: 'hhPedal', drum: 'hihat', label: 'Hi-hat pedal', kind: 'rect', cx: 140, cy: 400, w: 200, h: 56, radius: 16 },
  ],
};

export type Fit = { scale: number; dx: number; dy: number };

/** Scale and centre a layout inside a w × h box. */
export function fitLayout(layout: Pick<KitLayout, 'width' | 'height'>, w: number, h: number): Fit {
  const scale = Math.max(0, Math.min(w / layout.width, h / layout.height));
  return { scale, dx: (w - layout.width * scale) / 2, dy: (h - layout.height * scale) / 2 };
}

/** A point in the view → design units. */
export const toLayout = (x: number, y: number, f: Fit): [number, number] => (f.scale > 0 ? [(x - f.dx) / f.scale, (y - f.dy) / f.scale] : [NaN, NaN]);

/** A part's box in the view (left, top, width, height). */
export function partBox(p: KitPart, f: Fit): { left: number; top: number; width: number; height: number } {
  const w = p.kind === 'circle' ? p.r * 2 : p.w, h = p.kind === 'circle' ? p.r * 2 : p.h;
  return { left: f.dx + (p.cx - w / 2) * f.scale, top: f.dy + (p.cy - h / 2) * f.scale, width: w * f.scale, height: h * f.scale };
}

/** 0 at the centre, 1 on the edge (a rect uses its larger axis ratio). */
export function edgeDistance(p: KitPart, x: number, y: number): number {
  const dx = x - p.cx, dy = y - p.cy;
  if (p.kind === 'circle') return Math.hypot(dx, dy) / p.r;
  return Math.max(Math.abs(dx) / (p.w / 2), Math.abs(dy) / (p.h / 2));
}

/**
 * The part under a point (design units), with `slop` design units of forgiveness around each edge. Overlaps go to the
 * part whose centre is relatively closer.
 */
export function hitTest(layout: KitLayout, x: number, y: number, slop = 8): KitPart | null {
  let best: KitPart | null = null, bestD = Infinity;
  for (const p of layout.parts) {
    const size = p.kind === 'circle' ? p.r : Math.min(p.w, p.h) / 2;
    const d = edgeDistance(p, x, y);
    if (d > 1 + slop / size) continue;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** The smallest target side in points at this scale (Apple: at least 44). */
export function minTargetPt(layout: KitLayout, scale: number): number {
  return Math.min(...layout.parts.map(p => (p.kind === 'circle' ? p.r * 2 : Math.min(p.w, p.h)) * scale));
}
