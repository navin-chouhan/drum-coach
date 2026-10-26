import { emulateKit, MPS150, playNotes, STEADY_PLAYER, type Human } from '../engine/kitEmulator';
import { player, subscribePlayer } from '../play/player';
import { receiveMidi } from './hits';
import { inFreeBar } from '../engine/jam';
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
  const notes = run.notes.filter((_, i) => !player.auto[i]).map(n => ({ time: at(n.t), drum: n.drum, accent: n.accent, ghost: n.ghost, grace: n.grace, buzz: n.buzz }));
  // free bars (trade, own fill, solos): the emulated player fills them with 8ths on the snare and toms, so they're not silent
  if (o.freeBars) for (let b = 0; b < run.beats; b += 0.5)
    if (inFreeBar(b, run.beatsPerBar, o.fromBar, o.toBar - o.fromBar + 1, o.freeBars)) notes.push({ time: at(b), drum: (['snare', 'tom1', 'tom2', 'floor'] as const)[Math.floor((b % run.beatsPerBar) / (run.beatsPerBar / 4))], accent: undefined, ghost: undefined, grace: undefined, buzz: undefined });
  const kit = { ...MPS150, retrigger: emu.retriggers ? MPS150.retrigger : {}, crosstalk: emu.crosstalk ? MPS150.crosstalk : 0 };
  for (const m of emulateKit(playNotes(notes, emu), getNoteMap(), kit))
    timers.push(window.setTimeout(() => receiveMidi(m.data, m.timeStamp), m.timeStamp - performance.now())); // delivered after its timestamp, like Web MIDI
});
