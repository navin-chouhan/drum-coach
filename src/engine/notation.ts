import type { ChartDrum, ChartNote } from './chart.ts';

/** Standard drum-kit staff positions (percussion clef). Hands stem up, feet stem down. */
export const STAFF: Record<ChartDrum, { key: string; voice: 'hands' | 'feet' }> = {
  crash: { key: 'a/5/x2', voice: 'hands' }, ride: { key: 'f/5/x2', voice: 'hands' },
  hihat: { key: 'g/5/x2', voice: 'hands' }, hhOpen: { key: 'g/5/x2', voice: 'hands' },
  tom1: { key: 'e/5', voice: 'hands' }, tom2: { key: 'd/5', voice: 'hands' }, snare: { key: 'c/5', voice: 'hands' },
  floor: { key: 'a/4', voice: 'hands' }, kick: { key: 'f/4', voice: 'feet' }, hhPedal: { key: 'd/4/x2', voice: 'feet' },
};

export type NoteHead = { key: string; drum: ChartDrum; accent: boolean; ghost: boolean; open: boolean; i?: number }; // i = index of the source note, when given
/** One note/chord or rest. `slots` = length in grid steps of its beat (16ths, or 8th-triplets when `triplet`). */
export type NotationEvent = { heads: NoteHead[]; slots: number; triplet: boolean; beat: number }; // beat = where it starts (same clock as the notes' t)
export type Measure = { index: number; hands: NotationEvent[]; feet: NotationEvent[] };

const EPS = 1e-4;
const onGrid = (x: number, steps: number) => Math.abs(x * steps - Math.round(x * steps)) < 0.02;

/**
 * Chart notes → measures of hand/foot events, one beat at a time.
 * shortcut: compound meters (6/8, 12/8) are laid out per quarter beat (beams are regrouped in threes by the renderer);
 * a dotted-quarter note shows as quarter + 8th rest. Fine for reading, not engraving-perfect.
 */
export function layoutMeasures(notes: (ChartNote & { i?: number })[], beatsPerBar: number, fromBar = 1, toBar?: number): Measure[] {
  const last = notes.length ? Math.floor(notes[notes.length - 1].t / beatsPerBar + EPS) + 1 : 1;
  const end = toBar ?? last;
  const out: Measure[] = [];
  for (let m = fromBar; m <= end; m++) {
    const barStart = (m - 1) * beatsPerBar, measure: Measure = { index: m, hands: [], feet: [] };
    for (let b = 0; b < beatsPerBar - EPS; b++) {
      const beatStart = barStart + b, beatLen = Math.min(1, beatsPerBar - b);
      const inBeat = notes.filter(n => n.t >= beatStart - EPS && n.t < beatStart + beatLen - EPS);
      const rel = inBeat.map(n => n.t - beatStart);
      const triplet = beatLen === 1 && rel.some(x => !onGrid(x, 4)) && rel.every(x => onGrid(x, 3));
      const steps = triplet ? 3 : 4, slotsInBeat = Math.round(beatLen * steps);
      for (const voice of ['hands', 'feet'] as const) {
        const bySlot = new Map<number, NoteHead[]>();
        inBeat.forEach((n, i) => {
          if (STAFF[n.drum].voice !== voice) return;
          const s = Math.min(slotsInBeat - 1, Math.round(rel[i] * steps));
          const heads = bySlot.get(s) ?? [];
          if (!heads.some(h => h.key === STAFF[n.drum].key)) {
            heads.push({ key: STAFF[n.drum].key, drum: n.drum, accent: !!n.accent, ghost: !!n.ghost, open: n.drum === 'hhOpen', ...(n.i !== undefined && { i: n.i }) });
          } else if (n.i !== undefined) {
            const h = heads.find(x => x.key === STAFF[n.drum].key)!; // e.g. hi-hat closed + open on one spot: keep both sources
            h.i ??= n.i;
          }
          bySlot.set(s, heads);
        });
        const starts = [...bySlot.keys()].sort((a, c) => a - c);
        const events = measure[voice];
        if (!starts.length) { events.push({ heads: [], slots: slotsInBeat, triplet: false, beat: beatStart }); continue; }
        if (starts[0] > 0) events.push({ heads: [], slots: starts[0], triplet, beat: beatStart });
        starts.forEach((s, i) => events.push({ heads: bySlot.get(s)!, slots: (starts[i + 1] ?? slotsInBeat) - s, triplet, beat: beatStart + s / steps }));
      }
    }
    out.push(measure);
  }
  return out;
}

const STRAIGHT = ['', '16', '8', '8', 'q'];
/** VexFlow duration for an event: 16th grid 1→16, 2→8, 3→dotted 8, 4→q; triplet grid 1→8, 2→q (both tupleted). */
export function durationOf(e: NotationEvent): { duration: string; dots: number; inTuplet: boolean } {
  if (e.triplet) return { duration: e.slots === 1 ? '8' : 'q', dots: 0, inTuplet: e.slots < 3 };
  return { duration: STRAIGHT[e.slots] ?? 'q', dots: e.slots === 3 ? 1 : 0, inTuplet: false };
}

/** Cursor position: linear between the drawn positions of nearby beats (`points` sorted by beat). */
export function xAtBeat(points: { beat: number; x: number }[], beat: number): number {
  if (!points.length) return 0;
  if (beat <= points[0].beat) return points[0].x;
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    if (beat <= b.beat) return b.beat === a.beat ? b.x : a.x + ((beat - a.beat) / (b.beat - a.beat)) * (b.x - a.x);
  }
  return points[points.length - 1].x;
}

const CYMBALS = new Set(['hihat', 'hhOpen', 'ride', 'crash']);
const SLOT_WORD: Record<string, string> = { '0.25': 'e', '0.5': '&', '0.75': 'a', '0.333': 'trip', '0.667': 'let' };
/**
 * Hints under the notes: the count ("1", "&", "e", "a", "trip", "let") and who plays it: R / L hand, K kick foot,
 * H hi-hat foot. Cymbals are the right hand; a drum with a cymbal is the left; drums alone alternate R L (from R each bar).
 */
export function noteHints(notes: { t: number; drum: string }[], beatsPerBar: number): { t: number; count: string; limbs: string }[] {
  const groups = new Map<number, string[]>();
  for (const n of notes) { const t = Math.round(n.t * 1000) / 1000; groups.set(t, [...(groups.get(t) ?? []), n.drum]); }
  let next = 'R', bar = -1;
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([t, drums]) => {
    const b = Math.floor(t / beatsPerBar + 1e-6), pos = t - b * beatsPerBar, frac = Math.round((pos % 1) * 1000) / 1000;
    if (b !== bar) { bar = b; next = 'R'; }
    const cym = drums.filter(d => CYMBALS.has(d)).length, skins = drums.filter(d => !CYMBALS.has(d) && d !== 'kick' && d !== 'hhPedal').length;
    const hands = cym && skins ? ['R', 'L'] : cym ? ['R'] : skins > 1 ? ['R', 'L'] : skins ? [next] : [];
    if (!cym && skins === 1) next = next === 'R' ? 'L' : 'R';
    const limbs = [...hands, ...(drums.includes('kick') ? ['K'] : []), ...(drums.includes('hhPedal') ? ['H'] : [])];
    return { t, count: frac ? SLOT_WORD[String(frac)] ?? '' : String(Math.floor(pos) + 1), limbs: limbs.join('+') };
  });
}
