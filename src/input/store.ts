import { parseNoteMap, type NoteMap } from '../engine/kit';

// Note maps per device name: localStorage for offline start-up, mirrored to the server's SQLite settings.
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
      if (!k.startsWith('noteMap.')) continue;
      const name = k.slice('noteMap.'.length);
      try { localStorage.setItem(KEY + name, JSON.stringify(v)); } catch { /* ignore */ }
      if (name === kitName) setNoteMap(parseNoteMap(JSON.stringify(v)), false);
    }
    return all;
  } catch { return {}; }
}
