import type { DrumId } from '../engine/kit.ts';

// The kit's drums as the web draws them (layout from prototype/drum-stage.html; pop-art colours) and their names. Moved
// from the web's src/ui/drums.ts (it re-exports this) so the iPad uses the same names.
export type DrumGfx = { id: DrumId; name: string; x: number; y: number; r: number; type: 'kick' | 'drum' | 'cymbal' | 'hihat'; color: string };

export const DRUMS: DrumGfx[] = [
  { id: 'kick', name: 'Kick', x: 500, y: 470, r: 115, type: 'kick', color: '#E8423F' },
  { id: 'crash', name: 'Crash', x: 255, y: 160, r: 100, type: 'cymbal', color: '#FF5FA2' },
  { id: 'ride', name: 'Ride', x: 780, y: 170, r: 110, type: 'cymbal', color: '#FF9F1C' },
  { id: 'hihat', name: 'Hi-hat', x: 150, y: 320, r: 78, type: 'hihat', color: '#FFE14D' },
  { id: 'tom1', name: 'Tom 1', x: 405, y: 235, r: 66, type: 'drum', color: '#2F6FE4' },
  { id: 'tom2', name: 'Tom 2', x: 595, y: 235, r: 70, type: 'drum', color: '#8C5CFF' },
  { id: 'floor', name: 'Floor tom', x: 705, y: 410, r: 90, type: 'drum', color: '#7CD957' },
  { id: 'snare', name: 'Snare', x: 315, y: 400, r: 78, type: 'drum', color: '#2DE1C2' },
];
export const DRUM_BY_ID = Object.fromEntries(DRUMS.map(d => [d.id, d])) as Record<DrumId, DrumGfx>;
export const LANE_ORDER: DrumId[] = ['crash', 'ride', 'hihat', 'tom1', 'tom2', 'floor', 'snare', 'kick'];
/** Each drum's name ("Floor tom"), as the web kit names its lanes. */
export const DRUM_NAME = Object.fromEntries(DRUMS.map(d => [d.id, d.name])) as Record<DrumId, string>;
