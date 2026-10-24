import { parseNoteMap, type NoteMap } from '../engine/kit';

// shortcut: note maps live in localStorage per device name; move to SQLite with M6.
const KEY = 'drumcoach.noteMap.';
const listeners = new Set<() => void>();

function load(name: string): NoteMap {
  try { return parseNoteMap(localStorage.getItem(KEY + name)); } catch { return parseNoteMap(null); }
}

let kitName = 'keyboard';
let map = load(kitName);

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
  listeners.forEach(l => l());
}

export function setNoteMap(next: NoteMap) {
  map = next;
  try { localStorage.setItem(KEY + kitName, JSON.stringify(next)); } catch { /* private mode: keep in memory */ }
  listeners.forEach(l => l());
}
