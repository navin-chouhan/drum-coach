import type { DrumId } from '../engine/kit';

// Layout from prototype/drum-stage.html; painterly colours for the dream-surreal theme.
export type DrumGfx = { id: DrumId; name: string; x: number; y: number; r: number; type: 'kick' | 'drum' | 'cymbal' | 'hihat'; color: string };

export const DRUMS: DrumGfx[] = [
  { id: 'kick', name: 'Kick', x: 500, y: 470, r: 115, type: 'kick', color: '#C8553D' },
  { id: 'crash', name: 'Crash', x: 255, y: 160, r: 100, type: 'cymbal', color: '#D98FB0' },
  { id: 'ride', name: 'Ride', x: 780, y: 170, r: 110, type: 'cymbal', color: '#E0A458' },
  { id: 'hihat', name: 'Hi-hat', x: 150, y: 320, r: 78, type: 'hihat', color: '#8FB996' },
  { id: 'tom1', name: 'Tom 1', x: 405, y: 235, r: 66, type: 'drum', color: '#7FA7D9' },
  { id: 'tom2', name: 'Tom 2', x: 595, y: 235, r: 70, type: 'drum', color: '#9A8CD0' },
  { id: 'floor', name: 'Floor tom', x: 705, y: 410, r: 90, type: 'drum', color: '#B07AA1' },
  { id: 'snare', name: 'Snare', x: 315, y: 400, r: 78, type: 'drum', color: '#F2D57A' },
];
export const DRUM_BY_ID = Object.fromEntries(DRUMS.map(d => [d.id, d])) as Record<DrumId, DrumGfx>;
export const LANE_ORDER: DrumId[] = ['crash', 'ride', 'hihat', 'tom1', 'tom2', 'floor', 'snare', 'kick'];
