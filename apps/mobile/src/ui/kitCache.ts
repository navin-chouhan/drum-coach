// The hit bus's view of the kit, kept in memory (QA m1): the kit's name, its note map and its pad calibration are
// read from the port and the key-value store once, not on every hit. The name is dropped when the MIDI inputs change,
// the map and calibration when kitStore saves them (features/pads/kitStore.ts subscribeKitStore). Pure: hooks.ts wires it.
import { DEFAULT_NOTE_MAP, type NoteMap } from '@drum-coach/core/engine/kit';
import type { KitCalibration } from '@drum-coach/core/engine/padCal';

export type KitCacheDeps = {
  /** The kit's name now (a native call). `now` is a JS clock (Date.now), so the age check costs no native call. */
  kitName: () => string;
  readNoteMap: (kit: string) => NoteMap;
  readPadCal: (kit: string) => KitCalibration;
  /** Calls back when a note map or pad calibration is saved. */
  subscribeSaves: (fn: () => void) => () => void;
  /** Calls back when the MIDI inputs (and so maybe the kit) change. */
  subscribeInputs: (fn: () => void) => () => void;
  /**
   * With `now`: the name is also read again when it's older than this (a pick in Setup → MIDI input may not
   * announce itself as an inputs change). Then at most one native call per `nameMaxAgeMs`, never one per hit.
   */
  nameMaxAgeMs?: number;
  now?: () => number;
};

export type KitCache = {
  kit: () => string;
  noteMap: () => NoteMap;
  padCal: () => KitCalibration;
  /** Forget everything (the next hit reads again). */
  invalidate: () => void;
  stop: () => void;
};

export function createKitCache(d: KitCacheDeps): KitCache {
  let kit: string | undefined;
  let kitAt = 0;
  let map: NoteMap | undefined;
  let cal: KitCalibration | undefined;
  const dropStored = () => { map = undefined; cal = undefined; };
  const invalidate = () => { kit = undefined; dropStored(); };
  const offSaves = d.subscribeSaves(dropStored);
  const offInputs = d.subscribeInputs(invalidate);
  const kitNow = () => {
    const t = d.now?.() ?? 0;
    if (kit !== undefined && d.now && d.nameMaxAgeMs !== undefined && t - kitAt > d.nameMaxAgeMs) {
      const next = d.kitName();
      kitAt = t;
      if (next !== kit) { kit = next; dropStored(); }
    }
    if (kit === undefined) { kit = d.kitName(); kitAt = t; }
    return kit;
  };
  return {
    kit: kitNow,
    noteMap: () => { const k = kitNow(); return (map ??= safe(() => ({ ...DEFAULT_NOTE_MAP, ...d.readNoteMap(k) }), { ...DEFAULT_NOTE_MAP })); },
    padCal: () => { const k = kitNow(); return (cal ??= safe(() => d.readPadCal(k), {})); },
    invalidate,
    stop: () => { offSaves(); offInputs(); },
  };
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}
