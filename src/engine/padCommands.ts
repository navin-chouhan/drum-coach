import type { PadId } from './kit';

// Control the app from the kit, sticks in hand: quick double hits on one pad between takes,
// four quick crashes to stop a take (a groove doesn't crash four times in a second).
export type PadCommand = 'yes' | 'slower' | 'faster' | 'next' | 'stop';
export const PAD_COMMANDS: Partial<Record<PadId, PadCommand>> = { crash: 'yes', floor: 'slower', tom1: 'faster', ride: 'next' };
export const COMMAND_GAP_MS = 400, STOP_HITS = 4;

/** Feed every hit with whether a take is running; returns a command when a gesture completes. */
export function padCommands() {
  let pad: PadId | undefined, n = 0, last = -Infinity, wasPlaying = false;
  return (hit: { pad?: PadId; time: number }, playing: boolean): PadCommand | undefined => {
    // A hit in the take plus one after it isn't a double; nor is one from a different pad or too late.
    n = hit.pad === pad && playing === wasPlaying && hit.time - last < COMMAND_GAP_MS ? n + 1 : 1;
    pad = hit.pad; last = hit.time; wasPlaying = playing;
    if (playing) return pad === 'crash' && n === STOP_HITS ? 'stop' : undefined;
    return n === 2 && pad ? PAD_COMMANDS[pad] : undefined;
  };
}
