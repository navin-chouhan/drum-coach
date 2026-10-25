import { useEffect, useState, useSyncExternalStore } from 'react';
import { Thinking } from '../coach/api';
import { recentAccuracy } from '../engine/scoring';
import { player, playerVersion, position, subscribePlayer } from './player';

// Building blocks of the screens you use at the kit (lessons, Practice): read from 1–2 m, driven by pad gestures
// (engine/padCommands.ts). Each move shows its gesture, so you learn them by looking.

/** The coach's one line, big. While the coach thinks, the verdict stays and a small line under it says so. */
export function CoachLine({ line, under, thinking }: { line: string; under?: string; thinking?: boolean }) {
  return (
    <div className="say">
      <div className="avatar" aria-hidden>🥁</div>
      <div className="bubble" aria-live="polite">{line}{under && <p className="under">{under}</p>}{thinking && <Thinking what="Your coach is listening back" />}</div>
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

/** Flow mode's live line: how many of the notes in the last 4 bars landed. */
export function FlowMeter() {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 500); return () => clearInterval(t); }, []);
  const run = player.run, pos = position(), bpb = run?.beatsPerBar ?? 4;
  const mine = run ? run.notes.flatMap((_, i) => (player.auto[i] ? [] : [i])) : []; // your notes, not the app's
  const pct = run && pos > bpb ? recentAccuracy(mine.map(i => player.results[i]), { ...run, notes: mine.map(i => run.notes[i]) }, Math.max(0, pos - 4 * bpb), pos - 0.5) : null;
  const left = player.options?.seconds ? Math.max(0, Math.ceil(player.options.seconds - (performance.now() - player.zero) / 1000)) : undefined;
  return <div className="liveHint on">{left !== undefined ? `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left · ` : '🌊 '}{Math.max(0, Math.floor(pos / bpb))} bars{left === undefined ? ' in the flow' : ''}{pct !== null ? ` · last 4 bars: ${pct}% landed` : ''}</div>;
}
