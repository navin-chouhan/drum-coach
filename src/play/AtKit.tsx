import { useEffect, useState, useSyncExternalStore } from 'react';
import { player, playerVersion, subscribePlayer } from './player';

// Building blocks of the screens you use at the kit (lessons, Practice): read from 1–2 m, driven by pad gestures
// (engine/padCommands.ts). Each move shows its gesture, so you learn them by looking.

/** The coach's one line, big. */
export function CoachLine({ line }: { line: string }) {
  return (
    <div className="say">
      <div className="avatar" aria-hidden>🥁</div>
      <div className="bubble" aria-live="polite">{line}</div>
    </div>
  );
}

/** A move tile. `go` is the main move: hi-hat pedal × 3, crash × 2 or a spoken "yes". */
export function Move({ label, gesture, go, alt, onClick }: { label: string; gesture?: string; go?: boolean; alt?: boolean; onClick: () => void }) {
  return (
    <button className={`move ${go ? 'go' : alt ? 'alt' : ''}`} autoFocus={go} onClick={onClick}>
      <b>{label}</b>
      <span className="g">{go ? <><i>hi-hat pedal × 3</i> or <i>crash × 2</i> or say "yes"</> : gesture && <i>{gesture}</i>}</span>
    </button>
  );
}

/** While you play: the live tip, big enough to read from the throne. */
export function LiveHint() {
  useSyncExternalStore(subscribePlayer, playerVersion);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 500); return () => clearInterval(t); }, []);
  const c = player.cue, show = c && performance.now() - c.at < 3000;
  return <div className={`liveHint ${show ? 'on' : ''}`} role="status">{show ? `💡 ${c!.cue.text}` : ' '}</div>;
}
