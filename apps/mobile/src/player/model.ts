// The shared player's pure parts (D10, docs/mobile/REORG-PROPOSAL.md "Max screen"): which state the frame draws, the
// goal the bar shows ("□□ 2 clean → 75"), the take's top line, and what Esc does. Used by the lesson player,
// placement, Practice and Songs (R3). No React here; Vitest-tested.

/** ready: before a take (bar, coach line, music, moves). take: playing (only the music, the bar, one tip, Stop). results:
 * after a take (bar, coach line, the music with the take on it, the score card, moves). */
export type PlayerPhase = 'ready' | 'take' | 'results';

export function phaseOf(o: { playing: boolean; hasResults: boolean }): PlayerPhase {
  return o.playing ? 'take' : o.hasResults ? 'results' : 'ready';
}

/** The goal in the bar: the clean takes so far as boxes, then "2 clean → 75" (or "→ next step" / "→ done"). */
export type BarGoal = { boxes: { n: number; ok: number }; text: string };

/**
 * `need` clean takes in a row move you on: to `nextBpm` when the tempo still climbs, else to the next step, or the
 * lesson is done. Undefined when the take has no such goal (one-take items, jams, flow, streak challenges).
 */
export function barGoal(o: { boxes?: { n: number; ok: number }; bpm: number; target: number; lastStep: boolean }): BarGoal | undefined {
  if (!o.boxes) return undefined;
  const to = o.bpm < o.target ? String(Math.min(o.target, o.bpm + 5)) : o.lastStep ? 'done' : 'next step';
  return { boxes: o.boxes, text: `${o.boxes.n} clean → ${to}` };
}

/** "Bar 3 / 4" during a take; the count-in shows "Count-in" instead. */
export function takeBarText(o: { countIn?: number; bar: number; of?: number }): string {
  if (o.countIn !== undefined) return 'Count-in';
  return o.of ? `Bar ${o.bar} / ${o.of}` : `Bar ${o.bar}`;
}

/**
 * Esc in the player (one rule for every screen on it): a sheet or panel that's open closes first (it handles Esc
 * itself), a take stops, otherwise the player is left (‹).
 */
export function escAction(o: { overlayOpen: boolean; playing: boolean }): 'none' | 'stop' | 'back' {
  if (o.overlayOpen) return 'none';
  return o.playing ? 'stop' : 'back';
}

/** "46/48" as the score card shows it: the big number and the "/48" beside it. */
export function scoreParts(landed: number, total: number): { big: string; of: string } {
  return { big: String(landed), of: `/${total}` };
}
