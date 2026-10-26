import { mirrorHands } from './padCal.ts';
import type { ChartDrum, ChartNote } from './chart.ts';

/** Standard drum-kit staff positions (percussion clef). Hands stem up, feet stem down. */
export const STAFF: Record<ChartDrum, { key: string; voice: 'hands' | 'feet' }> = {
  crash: { key: 'a/5/x2', voice: 'hands' }, ride: { key: 'f/5/x2', voice: 'hands' },
  hihat: { key: 'g/5/x2', voice: 'hands' }, hhOpen: { key: 'g/5/x2', voice: 'hands' },
  tom1: { key: 'e/5', voice: 'hands' }, tom2: { key: 'd/5', voice: 'hands' }, snare: { key: 'c/5', voice: 'hands' },
  floor: { key: 'a/4', voice: 'hands' }, kick: { key: 'f/4', voice: 'feet' }, hhPedal: { key: 'd/4/x2', voice: 'feet' },
};

export type NoteHead = { key: string; drum: ChartDrum; accent: boolean; ghost: boolean; open: boolean; i?: number; grace?: number; buzz?: boolean }; // i = index of the source note, when given; grace = grace strokes before it
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
            heads.push({ key: STAFF[n.drum].key, drum: n.drum, accent: !!n.accent, ghost: !!n.ghost, open: n.drum === 'hhOpen', ...(n.i !== undefined && { i: n.i }), ...(n.grace && { grace: n.grace }), ...(n.buzz && { buzz: true }) });
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
/** `mirror`: a left-handed player (N9): R and L swapped. */
export function noteHints(notes: { t: number; drum: string; mine?: boolean; grace?: number; stick?: 'R' | 'L' }[], beatsPerBar: number, mirror = false): { t: number; count: string; limbs: string }[] {
  // `mine: false` = the app plays it: it still decides the sticking (an app hi-hat keeps your right hand busy) but gets no label.
  const groups = new Map<number, { drum: string; mine: boolean; grace?: number; stick?: 'R' | 'L' }[]>();
  for (const n of notes) { const t = Math.round(n.t * 1000) / 1000; groups.set(t, [...(groups.get(t) ?? []), { drum: n.drum, mine: n.mine !== false, grace: n.grace, stick: n.stick }]); }
  const anyCymbal = notes.some(n => CYMBALS.has(n.drum) && n.drum !== 'crash'); // a timekeeping hand in the groove
  let next = 'R', bar = -1;
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).flatMap(([t, here]) => {
    const b = Math.floor(t / beatsPerBar + 1e-6), pos = t - b * beatsPerBar, frac = Math.round((pos % 1) * 1000) / 1000;
    if (b !== bar) { bar = b; next = 'R'; }
    const cym = here.some(n => CYMBALS.has(n.drum)), skins = here.filter(n => !CYMBALS.has(n.drum) && n.drum !== 'kick' && n.drum !== 'hhPedal');
    // A drum alone in a groove with a timekeeping cymbal is the left hand's; with no cymbal anywhere, singles alternate.
    const lone = skins.length === 1 && !cym ? (anyCymbal ? 'L' : next) : undefined;
    if (lone && !anyCymbal) next = next === 'R' ? 'L' : 'R';
    const limbOf = (d: string, i: number, stick?: string) => (d === 'kick' ? 'K' : d === 'hhPedal' ? 'H' : stick ?? (CYMBALS.has(d) ? 'R' : cym ? 'L' : lone ?? (i ? 'L' : 'R')));
    // a grace note: the other hand's grace strokes in small letters first ("lR" flam, "llR" drag)
    const graced = (h: string, g?: number) => (g && (h === 'R' || h === 'L') ? (h === 'R' ? 'l' : 'r').repeat(g) + h : h);
    const limbs = [...new Set(here.flatMap((n, i) => (n.mine ? [graced(limbOf(n.drum, skins.indexOf(n) < 0 ? 0 : skins.indexOf(n), n.stick), n.grace)] : [])))]
      .sort((x, y) => 'RLKH'.indexOf(x.at(-1)!) - 'RLKH'.indexOf(y.at(-1)!));
    if (!limbs.length) return [];
    return [{ t, count: frac ? SLOT_WORD[String(frac)] ?? '' : String(Math.floor(pos) + 1), limbs: mirror ? mirrorHands(limbs.join('+')) : limbs.join('+') }];
  });
}

const DRUM_NAME: Record<string, string> = { hihat: 'hi-hat', hhOpen: 'open hi-hat', hhPedal: 'hi-hat pedal', ride: 'ride', crash: 'crash', snare: 'snare', tom1: 'tom 1', tom2: 'tom 2', floor: 'floor tom', kick: 'kick' };
const LIMB_NAME: Record<string, string> = { R: 'right hand', L: 'left hand', K: 'right foot', H: 'left foot' };
/**
 * Who plays what, for the intro slides: each limb (same letters as noteHints), its drums and when in the first bar
 * ("every 8th", "every beat", "1 and 3", "2, & of 3"…).
 */
export function limbPlan(notes: { t: number; drum: string; mine?: boolean }[], beatsPerBar: number, mirror = false) {
  const first = notes.filter(n => n.t < beatsPerBar - 1e-6);
  const hints = noteHints(first, beatsPerBar);
  return (['R', 'L', 'K', 'H'] as const).flatMap(limb => {
    const at = hints.filter(h => h.limbs.split('+').includes(limb));
    if (!at.length) return [];
    // Which of the drums at each moment are this limb's: with a cymbal and a drum together, the cymbal is R's, the drum L's.
    const mine = (t: number) => {
      const all = first.filter(n => Math.abs(n.t - t) < 1e-3), here = all.filter(n => n.mine !== false).map(n => n.drum);
      if (limb === 'K') return here.filter(d => d === 'kick');
      if (limb === 'H') return here.filter(d => d === 'hhPedal');
      const hands = here.filter(d => d !== 'kick' && d !== 'hhPedal'), cym = hands.filter(d => CYMBALS.has(d)), skins = hands.filter(d => !CYMBALS.has(d));
      return cym.length || skins.length > 1 || limb === 'L' && skins.length && all.some(n => CYMBALS.has(n.drum)) ? (limb === 'R' ? cym : skins) : hands;
    };
    const drums = [...new Set(at.flatMap(h => mine(h.t)))].map(d => DRUM_NAME[d] ?? d);
    const slots = at.map(h => h.t);
    const when = slots.length === beatsPerBar * 2 && slots.every((t, i) => Math.abs(t - i / 2) < 1e-3) ? 'every 8th'
      : slots.length === beatsPerBar && slots.every((t, i) => Math.abs(t - i) < 1e-3) ? 'every beat'
      : at.map(h => (h.count === '&' ? `& of ${Math.floor(h.t) + 1}` : h.count)).join(', ').replace(/, ([^,]+)$/, ' and $1');
    const shown = mirror ? mirrorHands(limb) : limb; // a left-handed player's right hand plays the left part
    return [{ limb: shown, name: LIMB_NAME[shown], drums, when }];
  }).sort((a, b) => 'RLKH'.indexOf(a.limb) - 'RLKH'.indexOf(b.limb));
}
