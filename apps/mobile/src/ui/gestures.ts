// The kit gestures that drive moves hands-free, as chips name them (docs/mockups/ipad/NOTES.md "Hands-free is
// visible"). The rules themselves are the core's (engine/padCommands.ts): this file only names them, so a chip can
// never show a gesture the kit doesn't do. Pure (no React Native).
import { PAD_COMMANDS, PEDAL_PRESSES, STOP_HITS, type PadCommand } from '@drum-coach/core/engine/padCommands';
import type { PadId } from '@drum-coach/core/engine/kit';

export type Gesture = { pad: PadId; times: number };

const PAD_WORD: Partial<Record<PadId, string>> = {
  hhPedal: 'hi-hat pedal', crash: 'crash', ride: 'ride', tom1: 'tom 1', tom2: 'tom 2', floor: 'floor', snare: 'snare', kick: 'kick',
};

/** "hi-hat pedal × 3", "tom 2 × 2". */
export const gestureLabel = (g: Gesture) => `${PAD_WORD[g.pad] ?? g.pad} × ${g.times}`;

/** "Hi-hat pedal three times": what a screen reader says. */
export function gestureSpoken(g: Gesture): string {
  const word = PAD_WORD[g.pad] ?? g.pad;
  const times = ['', 'once', 'twice', 'three times', 'four times'][g.times] ?? `${g.times} times`;
  return `${word[0].toUpperCase()}${word.slice(1)} ${times}`;
}

/** Every gesture that gives this command, in the order the chips show them (the pedal first for "yes"). */
export function gesturesFor(command: PadCommand | 'again'): Gesture[] {
  if (command === 'stop') return [{ pad: 'crash', times: STOP_HITS }];
  if (command === 'again') return [{ pad: 'kick', times: 2 }]; // say it again (D10; iPad only: ui/kitMoves.ts)
  const doubles = (Object.entries(PAD_COMMANDS) as [PadId, PadCommand][]).filter(([, c]) => c === command).map(([pad]) => ({ pad, times: 2 }));
  return command === 'yes' ? [{ pad: 'hhPedal', times: PEDAL_PRESSES }, ...doubles] : doubles;
}
