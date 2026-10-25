import { describe, expect, it } from 'vitest';
import { padCommands } from './padCommands';
import type { PadId } from './kit';

const feed = (hits: [PadId, number][], playing = false) => {
  const detect = padCommands();
  return hits.map(([pad, time]) => detect({ pad, time }, playing)).filter(Boolean);
};

describe('padCommands', () => {
  it('a quick double hit between takes is a command', () => {
    expect(feed([['crash', 0], ['crash', 200]])).toEqual(['yes']);
    expect(feed([['floor', 0], ['floor', 300]])).toEqual(['slower']);
    expect(feed([['tom1', 0], ['tom1', 300]])).toEqual(['faster']);
    expect(feed([['ride', 0], ['ride', 300]])).toEqual(['next']);
    expect(feed([['tom2', 0], ['tom2', 300]])).toEqual(['listen']);
  });
  it('three quick hi-hat pedal presses are yes; two are not, nor during a take', () => {
    expect(feed([['hhPedal', 0], ['hhPedal', 250], ['hhPedal', 500]])).toEqual(['yes']);
    expect(feed([['hhPedal', 0], ['hhPedal', 250]])).toEqual([]);
    expect(feed([['hhPedal', 0], ['hhPedal', 250], ['hhPedal', 500]], true)).toEqual([]);
  });
  it('slow, mixed or unmapped hits are not', () => {
    expect(feed([['crash', 0], ['crash', 500]])).toEqual([]);
    expect(feed([['crash', 0], ['snare', 100], ['crash', 200]])).toEqual([]);
    expect(feed([['snare', 0], ['snare', 100], ['kick', 200], ['kick', 300]])).toEqual([]);
  });
  it('a third hit does not fire again', () => {
    expect(feed([['crash', 0], ['crash', 150], ['crash', 300]])).toEqual(['yes']);
  });
  it('during a take only four quick crashes count: stop', () => {
    expect(feed([['crash', 0], ['crash', 200], ['ride', 300], ['ride', 400]], true)).toEqual([]);
    expect(feed([['crash', 0], ['crash', 200], ['crash', 400], ['crash', 600]], true)).toEqual(['stop']);
  });
  it('a crash at the end of a take plus one after it is not a double', () => {
    const detect = padCommands();
    expect(detect({ pad: 'crash', time: 0 }, true)).toBeUndefined();
    expect(detect({ pad: 'crash', time: 200 }, false)).toBeUndefined();
  });
});
