import { parseNoteMap, type NoteMap } from '../engine/kit';
import type { KitCalibration } from '../engine/padCal';

// Note maps per device name: localStorage for offline start-up, mirrored to the server's SQLite settings.
const KEY = 'drumcoach.noteMap.';
const listeners = new Set<() => void>();

function load(name: string): NoteMap {
  try { return parseNoteMap(localStorage.getItem(KEY + name)); } catch { return parseNoteMap(null); }
}

let kitName = 'keyboard';
let map = load(kitName);

// Per-pad velocity and retrigger calibration (N9), per kit like the note map.
const CAL_KEY = 'drumcoach.padCal.';
const loadCal = (name: string): KitCalibration => { try { return JSON.parse(localStorage.getItem(CAL_KEY + name) ?? '{}'); } catch { return {}; } };
let cal = loadCal(kitName);
export const getPadCal = () => cal;
export function setPadCal(next: KitCalibration, sync = true) {
  cal = next;
  try { localStorage.setItem(CAL_KEY + kitName, JSON.stringify(next)); } catch { /* private mode: keep in memory */ }
  if (sync) void fetch(`/api/settings/${encodeURIComponent('padCal.' + kitName)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) }).catch(() => {});
  listeners.forEach(l => l());
}

export const getKitName = () => kitName;
export const getNoteMap = () => map;

export function subscribeNoteMap(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Switch to the map saved for this device (kit). */
export function setKit(name: string) {
  if (name === kitName) return;
  kitName = name;
  map = load(name);
  cal = loadCal(name);
  listeners.forEach(l => l());
}

export function setNoteMap(next: NoteMap, sync = true) {
  map = next;
  try { localStorage.setItem(KEY + kitName, JSON.stringify(next)); } catch { /* private mode: keep in memory */ }
  if (sync) void fetch(`/api/settings/${encodeURIComponent('noteMap.' + kitName)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) }).catch(() => {});
  listeners.forEach(l => l());
}

/** Server copy wins on start-up (it survives clearing the browser). */
export async function syncFromServer() {
  try {
    const all: Record<string, unknown> = await (await fetch('/api/settings')).json();
    for (const [k, v] of Object.entries(all)) {
      if (k === 'padCal.' + kitName) { setPadCal(v as KitCalibration, false); continue; }
      if (!k.startsWith('noteMap.')) continue;
      const name = k.slice('noteMap.'.length);
      try { localStorage.setItem(KEY + name, JSON.stringify(v)); } catch { /* ignore */ }
      if (name === kitName) setNoteMap(parseNoteMap(JSON.stringify(v)), false);
    }
    return all;
  } catch { return {}; }
}
