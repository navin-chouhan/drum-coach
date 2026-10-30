// "Import files instead (drum MIDI + audio)": the web's src/content/SongsView.tsx without the DOM. The MIDI file is
// read with the core's midiToChart (@tonejs/midi) and saved to the iPad's charts table (songsRepo.ts). Pure
// TypeScript (Vitest-tested); the screen picks files with expo-document-picker.
import { CHART_DRUMS } from '@drum-coach/core/engine/chart';
import { midiToChart, type ImportResult } from '@drum-coach/core/engine/midiImport';
import type { StoredChart } from '../../data/songs';

export type ParsedImport = ImportResult & { file: string };

/** Reads a picked MIDI file; the error is the web's "Couldn't read <file>: …". */
export function parseMidiFile(bytes: Uint8Array, fileName: string): { ok: true; parsed: ParsedImport } | { ok: false; error: string } {
  try {
    const r = midiToChart(bytes, fileName.replace(/\.midi?$/i, ''));
    return { ok: true, parsed: { ...r, file: fileName } };
  } catch (e) {
    return { ok: false, error: `Couldn't read ${fileName}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** The summary lines under a parsed file. */
export function importSummary(p: ImportResult) {
  const c = p.chart;
  const counts = CHART_DRUMS.map(d => [d, c.notes.filter(n => n.drum === d).length] as const).filter(([, n]) => n);
  return {
    line: `${c.bpm} BPM · ${c.timeSignature.join('/')} · ${c.bars} bars · ${c.notes.length} notes${p.ignored > 0 ? ` · ${p.ignored} notes skipped (percussion this kit doesn't have)` : ''}`,
    counts: counts.map(([d, n]) => `${d} ${n}`).join(' · '),
  };
}
/** What Save stores: the typed title (trimmed, ≤ 120), or the file's own. */
export const chartToSave = (p: ImportResult, title: string) => ({ ...p.chart, title: (title.trim() || p.chart.title).slice(0, 120) });

export const IMPORT_HELP = 'The MIDI file should contain a drum track on channel 10. The audio should start at the same moment as the MIDI; you can fine-tune the offset on the Play tab while playing (Song sync).';
export const MIDI_TYPES = ['audio/midi', 'audio/x-midi', 'public.midi-audio'];
export const AUDIO_TYPES = ['audio/*'];
/** File extensions the web accepts for backing audio (server/index.ts AUDIO_TYPES). */
export const AUDIO_EXT = /\.(mp3|ogg|wav|flac|m4a|aac|webm)$/i;
export const isMidiName = (name: string) => /\.midi?$/i.test(name);

/** "Your library" rows: imported songs and coach exercises. */
export const libraryRow = (c: StoredChart) => ({
  id: c.id, title: c.title,
  detail: `${c.source === 'ai' ? 'coach exercise' : 'song'} · ${c.bpm} BPM · ${c.bars} bars${c.hasAudio ? ' · 🔊 audio' : ''}`,
  deleteQuestion: `Delete "${c.title}"? Its audio file is deleted too.`,
});
export const LIBRARY_EMPTY = 'No songs or coach exercises yet.';
