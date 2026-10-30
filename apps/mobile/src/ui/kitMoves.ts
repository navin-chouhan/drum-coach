// Kit gestures → moves, outside React (pure, tested): each hit goes through the core's padCommands, and a finished
// gesture runs the move registered for it. Screens register their moves with useKitMoves (hooks.ts).
import type { PadId } from '@drum-coach/core/engine/kit';
import { padCommands, type PadCommand } from '@drum-coach/core/engine/padCommands';

export type KitMoveHandlers = Partial<Record<PadCommand, () => void>>;

export type KitMoveRouter = {
  /** Feed every hit; `playing` = a take is running (only crash × 4 = stop counts then). Returns the command it ran. */
  hit(h: { pad?: PadId; time: number }, playing?: boolean): PadCommand | undefined;
  set(handlers: KitMoveHandlers): void;
};

export function createKitMoveRouter(initial: KitMoveHandlers = {}): KitMoveRouter {
  const feed = padCommands();
  let handlers = initial;
  return {
    hit(h, playing = false) {
      const cmd = feed(h, playing);
      const run = cmd ? handlers[cmd] : undefined;
      if (!run) return undefined;
      run();
      return cmd;
    },
    set(next) { handlers = next; },
  };
}
