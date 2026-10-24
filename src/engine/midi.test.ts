import { describe, expect, it } from 'vitest';
import { parseMidiMessage } from './midi';

describe('parseMidiMessage', () => {
  it('accepts channel 10 Note On', () => {
    expect(parseMidiMessage([0x99, 38, 100])).toEqual({ note: 38, velocity: 100 });
  });
  it('treats velocity 0 as off', () => {
    expect(parseMidiMessage([0x99, 38, 0])).toBeNull();
  });
  it('ignores Note Off, clock, active sensing and the hi-hat choke', () => {
    expect(parseMidiMessage([0x89, 38, 64])).toBeNull();
    expect(parseMidiMessage([0xf8])).toBeNull();
    expect(parseMidiMessage([0xfe])).toBeNull();
    expect(parseMidiMessage([0xa9, 46, 127])).toBeNull();
  });
});
