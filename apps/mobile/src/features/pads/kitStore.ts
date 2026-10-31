// The kit's note map and pad calibration, per kit name, in the key-value store under the web's keys
// (src/input/store.ts: drumcoach.noteMap.<kit>, drumcoach.padCal.<kit>). The app's hit bus reads them per hit
// (src/ui/hooks.ts getAppHitBus), so a save here counts from the next stroke. Pure: takes the store; never throws.
import { DEFAULT_NOTE_MAP, PADS, PAD_INFO, findConflicts, parseNoteMap, type NoteMap, type PadId } from '@drum-coach/core/engine/kit';
import type { KitCalibration } from '@drum-coach/core/engine/padCal';
import type { KeyValueStore } from '@drum-coach/core/platform';

export const noteMapKey = (kit: string) => `drumcoach.noteMap.${kit}`; // = KV_KEYS.noteMap (src/data/kv.ts)
export const padCalKey = (kit: string) => `drumcoach.padCal.${kit}`; // = KV_KEYS.padCal

/** The web's module help (src/ui/Calibrate.tsx MODULE_HELP), word for word. */
export const MODULE_HELP = 'On the module: press MODE until VOICE lights, hit the pad, press PAGE until the display shows Nxx, then set the note with [–]/[+].';

const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; listeners.forEach(l => l()); };
/** For useSyncExternalStore: changes whenever a note map or pad calibration is saved here. */
export const kitStoreVersion = () => version;
export function subscribeKitStore(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function readNoteMap(kv: Pick<KeyValueStore, 'get'>, kit: string): NoteMap {
  try { return parseNoteMap(kv.get(noteMapKey(kit))); } catch { return { ...DEFAULT_NOTE_MAP }; }
}

export function writeNoteMap(kv: KeyValueStore, kit: string, map: NoteMap): void {
  kv.set(noteMapKey(kit), JSON.stringify(map));
  changed();
}

export function readPadCal(kv: Pick<KeyValueStore, 'get'>, kit: string): KitCalibration {
  try {
    const v: unknown = JSON.parse(kv.get(padCalKey(kit)) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

export function writePadCal(kv: KeyValueStore, kit: string, cal: KitCalibration): void {
  kv.set(padCalKey(kit), JSON.stringify(cal));
  changed();
}

/** The note map with one pad changed, or null when the number isn't a MIDI note (0–127), as the web's input checks. */
export function withNote(map: NoteMap, pad: PadId, note: number): NoteMap | null {
  return Number.isInteger(note) && note >= 0 && note <= 127 ? { ...map, [pad]: note } : null;
}

/** "Tom 1 and Crash share a note. Change it …": the web's warning under the note map, or null with no clash. */
export function conflictText(map: NoteMap): string | null {
  const groups = findConflicts(map);
  if (!groups.length) return null;
  return `${groups.map(g => g.map(p => PAD_INFO[p].name).join(' and ')).join('; ')} share a note. `
    + `Change it in the app if you set it wrong here, or on the module. ${MODULE_HELP}`;
}

export type NoteRow = { pad: PadId; name: string; note: number; isDefault: boolean; conflict: boolean };

/** One row per pad for the note-map editor (web: Setup → Advanced → note map), in the web's PADS order. */
export function noteRows(map: NoteMap): NoteRow[] {
  const clash = new Set(findConflicts(map).flat());
  return PADS.map(pad => ({ pad, name: PAD_INFO[pad].name, note: map[pad], isDefault: map[pad] === DEFAULT_NOTE_MAP[pad], conflict: clash.has(pad) }));
}

/** The note map row's value in Setup: "MPS-150 defaults", or the defaults plus what differs ("tom 1 = 47"). */
export function noteMapSummary(map: NoteMap): string {
  const diff = PADS.filter(p => map[p] !== DEFAULT_NOTE_MAP[p]).map(p => `${PAD_INFO[p].name.toLowerCase()} = ${map[p]}`);
  if (findConflicts(map).length) return `${diff.length ? `${diff.join(', ')} · ` : ''}two pads share a note`;
  return diff.length ? `MPS-150 defaults, ${diff.join(', ')}` : 'MPS-150 defaults';
}
