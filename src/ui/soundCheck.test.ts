import { describe, expect, it } from 'vitest';
import { nudgeLevel } from './SoundCheckCard';

describe('sound check from the throne (N9)', () => {
  it('too quiet adds 10%, too loud takes 10% off, OK keeps it; never past the slider range', () => {
    expect(nudgeLevel(0.6, 0, 'bandVolume')).toBe(0.7);
    expect(nudgeLevel(0.6, 2, 'bandVolume')).toBe(0.5);
    expect(nudgeLevel(0.6, 1, 'bandVolume')).toBe(0.6);
    expect(nudgeLevel(1.25, 0, 'clickVolume')).toBe(1.25);
    expect(nudgeLevel(0.2, 2, 'voiceVolume')).toBe(0.2);
    expect(nudgeLevel(0.05, 2, 'bandVolume')).toBe(0);
  });
});
