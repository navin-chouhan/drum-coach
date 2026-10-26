import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { takeToMidi } from './exportMidi';

describe('a take as a MIDI file (N2)', () => {
  it('your own strokes, on the GM drum channel, at their real times and loudness', () => {
    const bytes = takeToMidi({ hits: [{ time: 1000, pad: 'kick', velocity: 100 }, { time: 1500, pad: 'snare', velocity: 64 }, { time: 1500, pad: 'hhClosed', velocity: 90 }], zero: 1000, bpm: 120, title: 'The money beat' });
    const m = new Midi(bytes);
    expect(m.header.tempos[0].bpm).toBe(120);
    const notes = m.tracks[0].notes;
    expect(notes.map(n => n.midi)).toEqual([36, 38, 42]);
    expect(notes[1].time).toBeCloseTo(0.5, 3);
    expect(Math.round(notes[0].velocity * 127)).toBe(100);
    expect(m.tracks[0].channel).toBe(9);
    expect(m.name).toBe('The money beat');
  });
});
