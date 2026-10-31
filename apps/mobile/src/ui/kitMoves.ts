// Kit gestures → moves, outside React (pure, tested): each hit goes through the core's padCommands, and a finished
// gesture runs the move registered for it. Screens register their moves with useKitMoves (hooks.ts).
// The iPad adds one move the web doesn't have: kick × 2 between takes = "again" (say the last thing again, D10
// voice first). The kick has no command in core's padCommands, so the web is unchanged.
import type { PadId } from '@drum-coach/core/engine/kit';
import { COMMAND_GAP_MS, padCommands, type PadCommand } from '@drum-coach/core/engine/padCommands';

export type KitMove = PadCommand | 'again';
export type KitMoveHandlers = Partial<Record<KitMove, () => void>>;

export type KitMoveRouter = {
  /** Feed every hit; `playing` = a take is running (only crash × 4 = stop counts then). Returns the command it ran. */
  hit(h: { pad?: PadId; time: number }, playing?: boolean): KitMove | undefined;
  set(handlers: KitMoveHandlers): void;
};

/** Kick × 2 within COMMAND_GAP_MS between takes (the same rule as core's doubles): "again". */
export function kickAgain() {
  let n = 0, last = -Infinity;
  return (h: { pad?: PadId; time: number }, playing: boolean): 'again' | undefined => {
    if (playing || h.pad !== 'kick') { n = 0; return undefined; }
    n = h.time - last < COMMAND_GAP_MS ? n + 1 : 1;
    last = h.time;
    return n === 2 ? 'again' : undefined;
  };
}

export function createKitMoveRouter(initial: KitMoveHandlers = {}): KitMoveRouter {
  const feed = padCommands(), kick = kickAgain();
  let handlers = initial;
  return {
    hit(h, playing = false) {
      const cmd: KitMove | undefined = feed(h, playing) ?? kick(h, playing);
      const run = cmd ? handlers[cmd] : undefined;
      if (!run) return undefined;
      run();
      return cmd;
    },
    set(next) { handlers = next; },
  };
}
