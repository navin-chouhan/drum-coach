// Share take (D5): the take as a standard MIDI file (core takeToMidi, the web's "Save take as MIDI"), named as the
// web names it (`${title} ${stamp()}.mid`), safe as a file name. The share sheet itself is the screen's (shareFile).
import { takeToMidi } from '@drum-coach/core/engine/exportMidi';
import type { Finished } from './types';

/** src/ui/download.ts stamp: 2026-10-30-19-45. */
export const stamp = (d = new Date()) => d.toISOString().slice(0, 16).replace(/[:T]/g, '-');
/** A file name iOS accepts: no path separators or control characters. */
export const safeFileName = (name: string) => name.replace(/[/\\:\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'take';

export const canShare = (f: Finished | undefined) => !!f && f.hits.length > 0;

export function takeFile(f: Finished, title: string, now = new Date()): { name: string; bytes: Uint8Array } {
  return {
    name: `${safeFileName(`${title} ${stamp(now)}`)}.mid`,
    bytes: takeToMidi({ hits: f.hits, zero: f.zero, bpm: Math.round(f.chart.bpm * f.options.speed), title }),
  };
}
