import { DEFAULT_NOTE_MAP } from '@drum-coach/core/engine/kit';
import { describe, expect, it, vi } from 'vitest';
import { createKitCache } from './kitCache';

function setup() {
  let saves: () => void = () => {}, inputs: () => void = () => {};
  let name = 'e-Drum';
  const deps = {
    kitName: vi.fn(() => name),
    readNoteMap: vi.fn((kit: string) => ({ ...DEFAULT_NOTE_MAP, tom1: kit === 'e-Drum' ? 50 : 60 })),
    readPadCal: vi.fn(() => ({ snare: { min: 10, max: 120 } }) as never),
    subscribeSaves: (fn: () => void) => { saves = fn; return () => { saves = () => {}; }; },
    subscribeInputs: (fn: () => void) => { inputs = fn; return () => { inputs = () => {}; }; },
  };
  const cache = createKitCache(deps);
  return { cache, deps, save: () => saves(), replug: (n: string) => { name = n; inputs(); } };
}

describe('the hit bus kit cache (QA m1)', () => {
  it('reads the name, map and calibration once for many hits', () => {
    const { cache, deps } = setup();
    for (let i = 0; i < 100; i++) { cache.noteMap(); cache.padCal(); }
    expect(cache.noteMap().tom1).toBe(50);
    expect(deps.kitName).toHaveBeenCalledTimes(1);
    expect(deps.readNoteMap).toHaveBeenCalledTimes(1);
    expect(deps.readPadCal).toHaveBeenCalledTimes(1);
  });

  it('reads the store again after a save, and the kit again after the inputs change', () => {
    const { cache, deps, save, replug } = setup();
    cache.noteMap();
    save();
    cache.noteMap(); cache.padCal();
    expect(deps.readNoteMap).toHaveBeenCalledTimes(2);
    expect(deps.kitName).toHaveBeenCalledTimes(1);
    replug('Other kit');
    expect(cache.noteMap().tom1).toBe(60);
    expect(cache.kit()).toBe('Other kit');
    expect(deps.kitName).toHaveBeenCalledTimes(2);
  });

  it('re-reads an old name at most once per max age, and the store only when the kit changed', () => {
    let t = 0, name = 'e-Drum';
    const kitName = vi.fn(() => name), readNoteMap = vi.fn(() => DEFAULT_NOTE_MAP);
    const cache = createKitCache({ kitName, readNoteMap, readPadCal: () => ({}), subscribeSaves: () => () => {}, subscribeInputs: () => () => {}, nameMaxAgeMs: 2000, now: () => t });
    cache.noteMap(); t = 1500; cache.noteMap();
    expect(kitName).toHaveBeenCalledTimes(1);
    t = 2500; cache.noteMap();
    expect(kitName).toHaveBeenCalledTimes(2);
    expect(readNoteMap).toHaveBeenCalledTimes(1);
    name = 'Other'; t = 5000; cache.noteMap();
    expect(readNoteMap).toHaveBeenCalledTimes(2);
  });

  it('falls back to the defaults when the store throws, and stops listening on stop', () => {
    const { cache, deps, save } = setup();
    deps.readNoteMap.mockImplementationOnce(() => { throw new Error('db'); });
    expect(cache.noteMap()).toEqual(DEFAULT_NOTE_MAP);
    cache.stop();
    save();
    cache.noteMap();
    expect(deps.readNoteMap).toHaveBeenCalledTimes(1);
  });
});
