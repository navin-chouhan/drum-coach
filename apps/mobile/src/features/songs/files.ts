// Picking and keeping import files on the iPad (expo-document-picker, expo-file-system): the web's <input type=file>
// and PUT /api/charts/:id/audio. Backing audio is copied into the app's Documents directory (not Caches, which iOS
// may purge) as backing/<chartId>.<ext>; the charts table keeps that relative name. Your own files only: nothing
// here touches YouTube.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { AUDIO_EXT, AUDIO_TYPES, MIDI_TYPES, backingName } from './importModel';

export type Picked = { name: string; uri: string } | null;

async function pick(type: string[]): Promise<Picked> {
  const r = await DocumentPicker.getDocumentAsync({ type, copyToCacheDirectory: true, multiple: false });
  const a = r.canceled ? undefined : r.assets[0];
  return a ? { name: a.name, uri: a.uri } : null;
}

/** A MIDI file's name and bytes, or null when the student cancelled. */
export async function pickMidi(): Promise<{ name: string; bytes: Uint8Array } | null> {
  const p = await pick([...MIDI_TYPES, 'application/octet-stream']);
  if (!p) return null;
  const f = new File(p.uri);
  try { return { name: p.name, bytes: await f.bytes() }; } finally { try { f.delete(); } catch { /* the picker's temporary copy */ } }
}

/** An audio file (left in the picker's temporary copy until saveBacking keeps it). */
export const pickAudio = (): Promise<Picked> => pick(AUDIO_TYPES);
export const isAudioName = (name: string) => AUDIO_EXT.test(name);

const backingDir = () => new Directory(Paths.document, 'backing');

/** Moves the picked audio into Documents/backing; returns the relative name to store. */
export function saveBacking(picked: { name: string; uri: string }, chartId: string): string {
  const name = backingName(chartId, picked.name);
  const dir = backingDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const to = new File(dir, name.slice('backing/'.length));
  if (to.exists) to.delete();
  new File(picked.uri).moveSync(to);
  return name;
}

/** The kept file's URI (for the backing player, A4's BackingPort). */
export const backingUri = (relative: string) => new File(Paths.document, relative).uri;

export function deleteBacking(relative: string | null | undefined) {
  if (!relative) return;
  try { const f = new File(Paths.document, relative); if (f.exists) f.delete(); } catch { /* already gone */ }
}
