import { emulateKit, MPS150, playNotes, STEADY_PLAYER, type Human } from '../engine/kitEmulator';
import { player, subscribePlayer } from '../play/player';
import { receiveMidi } from './hits';
import { getSettings } from './settings';
import { getNoteMap } from './store';

/** The emulated kit plays every take for you, through the same input as the real kit. Testing only: not saved. */
export type EmulatedKit = Human & { on: boolean; retriggers: boolean; crosstalk: boolean };
let emu: EmulatedKit = { on: false, ...STEADY_PLAYER, retriggers: true, crosstalk: true };
const listeners = new Set<() => void>();
export const getEmulatedKit = () => emu;
export const subscribeEmulatedKit = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function setEmulatedKit(p: Partial<EmulatedKit>) { emu = { ...emu, ...p }; listeners.forEach(l => l()); }

let timers: number[] = [], current: unknown;
subscribePlayer(() => {
  const run = player.phase === 'playing' ? player.run : undefined;
  if (run === current) return;
  current = run; timers.forEach(clearTimeout); timers = [];
  const o = player.options;
  if (!run || !emu.on || !o || o.wait || o.external || o.demo) return; // wait mode and songs have no fixed note times
  // Real hits arrive latencyMs late (that's what the latency test measures), so the emulated ones do too.
  const at = (t: number) => player.zero + t * player.beatMs + getSettings().latencyMs;
  const notes = run.notes.filter((_, i) => !player.auto[i]).map(n => ({ time: at(n.t), drum: n.drum, accent: n.accent, ghost: n.ghost, grace: n.grace }));
  const kit = { ...MPS150, retrigger: emu.retriggers ? MPS150.retrigger : {}, crosstalk: emu.crosstalk ? MPS150.crosstalk : 0 };
  for (const m of emulateKit(playNotes(notes, emu), getNoteMap(), kit))
    timers.push(window.setTimeout(() => receiveMidi(m.data, m.timeStamp), m.timeStamp - performance.now())); // delivered after its timestamp, like Web MIDI
});
