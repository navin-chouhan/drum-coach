import type { ChartDrum } from './chart.ts';
import type { PadId } from './kit.ts';

// Live tips while you play: a few rules on the last two bars, gated so the coach speaks rarely.
// See docs/plans/coach-voice-and-live-feedback.md.

export type Chattiness = 'quiet' | 'normal' | 'talkative';
export type WindowNote = { drum: ChartDrum; accent?: boolean; ghost?: boolean; judgement: 'perfect' | 'good' | 'miss'; offset?: number; off?: number; velocity?: number; pad?: PadId }; // off: an off-time stroke's ms (a miss, but played)
/** What happened in the last two bars (notes already past the hit line, oldest first). */
export type LiveWindow = { bar: number; notes: WindowNote[]; extras: number; reaction?: number | null; // reaction: see scoring.reactingToClick
  target?: { ms: number; tol: number } }; // a step that asks to play behind (or on top of) the beat: timing is judged against it
export type Cue = { id: string; text: string; spoken: string; priority: number };

const NAME: Partial<Record<ChartDrum, string>> = { hihat: 'hi-hat', hhOpen: 'open hi-hat', hhPedal: 'hi-hat foot', tom1: 'tom 1', tom2: 'tom 2', floor: 'floor tom' };
export const drumName = (d: string) => NAME[d as ChartDrum] ?? d;
const name = (d: ChartDrum) => drumName(d);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };

const LEVEL = {
  quiet: { timingMs: 30, minPriority: 70, gapBars: 4, dynamics: false, praise: false },
  normal: { timingMs: 20, minPriority: 40, gapBars: 2, dynamics: false, praise: true },
  talkative: { timingMs: 15, minPriority: 0, gapBars: 2, dynamics: true, praise: true },
} as const;
const COOLDOWN_BARS = 8;

/** Every tip the rules see in this window, most important first (no gating). */
export function candidateCues(w: LiveWindow, c: Chattiness): Cue[] {
  const L = LEVEL[c], out: Cue[] = [];
  if (w.notes.length < 6) return out;
  if (w.reaction) out.push({ id: 'reacting', priority: 95, text: `Hitting ${w.reaction} ms after each click. Play with the click, not after it`, spoken: 'Play with the click, not after it' });
  for (const drum of new Set(w.notes.map(n => n.drum))) {
    const last3 = w.notes.filter(n => n.drum === drum).slice(-3);
    if (last3.length === 3 && last3.every(n => n.judgement === 'miss' && n.off === undefined)) { // not played at all (off time is a timing tip)
      out.push({ id: `missing-${drum}`, priority: 100, text: `Bring the ${name(drum)} back in`, spoken: `${name(drum)}!` });
    }
  }
  // MPS-150: the hi-hat pad sends "open" unless the pedal is held down
  if (w.notes.filter(n => n.drum === 'hihat' && n.pad === 'hhOpen').length >= 2) {
    out.push({ id: 'hh-open', priority: 90, text: 'Hi-hat foot down (it sounds open)', spoken: 'Hi-hat foot down' });
  }
  const played = w.notes.flatMap(n => (n.offset ?? n.off) === undefined ? [] : [(n.offset ?? n.off)!]); // on time or off time
  if (played.length >= 6) {
    const m = mean(played) - (w.target?.ms ?? 0), lim = w.target ? w.target.tol : L.timingMs; // a target brings its own tolerance
    if (w.target && w.target.ms > 0 && m < -lim) out.push({ id: 'lay-back', priority: 70, text: 'Lay back: let it land just behind the click', spoken: 'Lay back' });
    else if (w.target && m > lim) out.push({ id: 'too-far-back', priority: 70, text: 'A touch too far back: closer to the click', spoken: 'Closer to the click' });
    else if (m < -lim) out.push({ id: 'rushing', priority: 70, text: `Rushing by ${Math.round(-m)} ms. Sit back on the click`, spoken: 'Rushing. Sit back' });
    else if (m > lim) out.push({ id: 'dragging', priority: 70, text: `Dragging by ${Math.round(m)} ms. Push a little`, spoken: 'Dragging. Push' });
    else if (std(played) > 35) out.push({ id: 'unsteady', priority: 50, text: 'Steady. Listen to the click', spoken: 'Steady' });
  }
  if (w.extras >= 3) out.push({ id: 'extras', priority: 40, text: 'Only the notes shown', spoken: 'Only the notes shown' });
  if (L.dynamics) {
    const v = (f: (n: WindowNote) => boolean) => w.notes.filter(n => f(n) && n.velocity !== undefined).map(n => n.velocity!);
    const acc = v(n => !!n.accent), ghost = v(n => !!n.ghost), plain = v(n => !n.accent && !n.ghost);
    if (acc.length >= 2 && plain.length >= 2 && mean(acc) < mean(plain) + 10) out.push({ id: 'accents', priority: 30, text: 'Make the accents louder', spoken: 'Accents louder' });
    else if (ghost.length >= 2 && mean(ghost) > 60) out.push({ id: 'ghosts', priority: 30, text: 'Ghost notes softer', spoken: 'Softer ghost notes' });
    else if (plain.length >= 8 && std(plain) / mean(plain) > 0.2) out.push({ id: 'even', priority: 20, text: 'Even strokes: same height every time', spoken: 'Even strokes' });
  }
  return out.filter(cue => cue.priority >= L.minPriority).sort((a, b) => b.priority - a.priority);
}

/**
 * Stateful gate, called once per bar: at most one tip every couple of bars, never in the first bar,
 * each tip at most once per 8 bars, and a short "That's it!" when a corrected problem is gone.
 */
export function createLiveCoach(chattiness: Chattiness) {
  const L = LEVEL[chattiness];
  let lastBar = -Infinity, correcting = false;
  const lastById = new Map<string, number>();
  return (w: LiveWindow): Cue | null => {
    if (w.bar < 1 || w.bar - lastBar < L.gapBars) return null;
    const all = candidateCues(w, chattiness);
    const cue = all.find(c => w.bar - (lastById.get(c.id) ?? -Infinity) >= COOLDOWN_BARS);
    if (cue) { lastBar = w.bar; lastById.set(cue.id, w.bar); correcting = true; return cue; }
    const clean = w.notes.length >= 6 && w.notes.every(n => n.judgement !== 'miss') && !all.length && w.extras === 0;
    if (L.praise && correcting && clean) { lastBar = w.bar; correcting = false; return { id: 'praise', priority: 10, text: "That's it!", spoken: "That's it" }; }
    return null;
  };
}

/** Everything the coach may say during play, so the voice can prepare it ahead of time. */
export const SPOKEN_CUES = [
  'Rushing. Sit back', 'Dragging. Push', 'Steady', 'Only the notes shown', 'Hi-hat foot down',
  'Accents louder', 'Softer ghost notes', 'Even strokes', "That's it", 'Lay back', 'Closer to the click',
  ...(['kick', 'snare', 'hihat', 'hhOpen', 'hhPedal', 'tom1', 'tom2', 'floor', 'crash', 'ride'] as ChartDrum[]).map(d => `${name(d)}!`),
];
