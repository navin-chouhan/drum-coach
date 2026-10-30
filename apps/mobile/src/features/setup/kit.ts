// Setup → Kit: the e-Drum's status, the MIDI input list (hot-plug), the selection kept by name (web: useMidi's
// drumcoach.midiInput), and the last hit. Pure; the screen reads the MIDI port and the hit bus.
import { PAD_INFO, type PadId } from '@drum-coach/core/engine/kit';
import type { Hit } from '@drum-coach/core/input/hits';
import type { MidiInputInfo } from '../../platform/contracts';

export const MIDI_INPUT_KEY = 'drumcoach.midiInput'; // = KV_KEYS.midiInput (the web's key: the selected input's name)

export type KitStatus = {
  /** "e-Drum", or "No kit plugged in". */
  title: string;
  /** "USB · Medeli · connected". */
  sub: string;
  connected: boolean;
  /** The MIDI module isn't in this build (Expo Go, simulator): touch pads only. */
  noMidi: boolean;
};

export function kitStatus(midi: boolean, connected: MidiInputInfo | null): KitStatus {
  if (!midi) return { title: 'Touch pads', sub: 'MIDI needs the Drum Coach build on the iPad', connected: false, noMidi: true };
  if (!connected) return { title: 'No kit plugged in', sub: 'Plug the module into the USB-C port. Touch pads work meanwhile.', connected: false, noMidi: false };
  const usb = /network|session/i.test(connected.name) ? 'Network MIDI' : 'USB';
  return { title: connected.name, sub: [usb, connected.manufacturer, 'connected'].filter(Boolean).join(' · '), connected: true, noMidi: false };
}

/** The connected input (online), from the port's selection. */
export function connectedInput(inputs: MidiInputInfo[], connectedId: string | null | undefined): MidiInputInfo | null {
  return (connectedId ? inputs.find(i => i.id === connectedId && i.online) : undefined) ?? null;
}

/** The inputs to choose from: online ones first, then by name. */
export const inputChoices = (inputs: MidiInputInfo[]) =>
  [...inputs].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));

/** The saved name's online input (a replugged device comes back with a new id; names are the stable key). */
export function savedInput(inputs: MidiInputInfo[], savedName: string | null): MidiInputInfo | null {
  return savedName ? inputs.find(i => i.online && i.name === savedName) ?? null : null;
}

export type LastHitView = { name: string; sub: string; pad: PadId | null; velocity: number };

/** The last hit (web LastHit / Calibrate lastHit): pad name or "Note 52", and "note 38 · velocity 92". */
export function lastHitView(hit: Hit | undefined): LastHitView {
  if (!hit) return { name: 'Hit a pad', sub: 'the last hit shows here', pad: null, velocity: 0 };
  return {
    name: hit.pad ? PAD_INFO[hit.pad].name : `Note ${hit.note}`,
    sub: `${hit.pad ? `note ${hit.note} · ` : 'not mapped · '}velocity ${hit.velocity}`,
    pad: hit.pad ?? null, velocity: hit.velocity,
  };
}

/** The web kit's hit words (src/ui/KitView.tsx BURST). */
export const HIT_WORD: Record<PadId, string> = {
  kick: 'BOOM!', snare: 'BAM!', tom1: 'DUM!', tom2: 'DUM!', floor: 'DOOM!', crash: 'KRASH!', ride: 'TING!', hhClosed: 'TSS!', hhOpen: 'TSSSH!', hhPedal: 'CHK!',
};

/** "BAM! You hit the snare" (first run, plug in). */
export function firstHitLine(hit: Hit): string {
  return hit.pad ? `${HIT_WORD[hit.pad]} You hit the ${PAD_INFO[hit.pad].name.toLowerCase()}` : `Note ${hit.note} arrived (not mapped to a pad yet)`;
}

export const KIT_FOOT = 'MIDI clock and active sensing are filtered. The hi-hat pad sends open unless the pedal is down.';
/** The hardware-keyboard keys (CLAUDE.md), as the web's Kit test lists them. */
export const KEYS_LINE = 'No kit? Keys: Space kick · S snare · A/Q hi-hat closed/open · Z pedal · E R F toms · W crash · T ride · Shift = accent. Or tap a pad.';
