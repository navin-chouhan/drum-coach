import type { DrumId } from '../engine/kit';

// Layout and colours from prototype/drum-stage.html.
export type DrumGfx = { id: DrumId; name: string; x: number; y: number; r: number; type: 'kick' | 'drum' | 'cymbal' | 'hihat'; color: string };

export const DRUMS: DrumGfx[] = [
  { id: 'kick', name: 'Kick', x: 500, y: 470, r: 115, type: 'kick', color: '#ff6b6b' },
  { id: 'crash', name: 'Crash', x: 255, y: 160, r: 100, type: 'cymbal', color: '#f72585' },
  { id: 'ride', name: 'Ride', x: 780, y: 170, r: 110, type: 'cymbal', color: '#ff9f1c' },
  { id: 'hihat', name: 'Hi-hat', x: 150, y: 320, r: 78, type: 'hihat', color: '#2ee6a6' },
  { id: 'tom1', name: 'Tom 1', x: 405, y: 235, r: 66, type: 'drum', color: '#4cc9f0' },
  { id: 'tom2', name: 'Tom 2', x: 595, y: 235, r: 70, type: 'drum', color: '#5b8cff' },
  { id: 'floor', name: 'Floor tom', x: 705, y: 410, r: 90, type: 'drum', color: '#9b7bff' },
  { id: 'snare', name: 'Snare', x: 315, y: 400, r: 78, type: 'drum', color: '#ffd166' },
];
export const DRUM_BY_ID = Object.fromEntries(DRUMS.map(d => [d.id, d])) as Record<DrumId, DrumGfx>;
export const LANE_ORDER: DrumId[] = ['crash', 'ride', 'hihat', 'tom1', 'tom2', 'floor', 'snare', 'kick'];
