import { createHitBus } from '@drum-coach/core/input/hits';
import { DEFAULT_NOTE_MAP } from '@drum-coach/core/engine/kit';
import { describe, expect, it } from 'vitest';
import { startKitSounds, withoutKitSound } from './kitSounds';

function rig(on = true) {
  let t = 0;
  const bus = createHitBus({ now: () => t, getNoteMap: () => DEFAULT_NOTE_MAP, getPadCal: () => ({}) });
  const played: [string, number][] = [];
  const state = { on };
  const stop = startKitSounds({ onHit: bus.onHit, enabled: () => state.on, playNow: (s, g) => { played.push([s, g]); } });
  return { bus, played, state, stop, at: (ms: number) => { t = ms; } };
}

describe('kit sounds (the web browserSounds)', () => {
  it('plays each kit hit at once, by its pad and velocity', () => {
    const r = rig();
    r.bus.receiveMidi([0x99, 38, 127], 0);
    r.bus.receiveMidi([0x99, 36, 64], 100);
    r.bus.receiveMidi([0x99, 36, 0], 120); // note off: no sound
    expect(r.played.map(([s]) => s)).toEqual(['drum.snare', 'drum.kick']);
    expect(r.played[0][1]).toBe(1);
  });
  it('is silent when off, and after stop', () => {
    const r = rig(false);
    r.bus.receiveMidi([0x99, 38, 100], 0);
    r.state.on = true; r.stop();
    r.bus.receiveMidi([0x99, 38, 100], 500);
    expect(r.played).toEqual([]);
  });
  it('a touch pad stroke (which sounds itself) never sounds twice; keys sound', () => {
    const r = rig();
    withoutKitSound(() => r.bus.emitPad('tom1', 100, 0));
    expect(r.played).toEqual([]);
    r.bus.emitPad('crash', 100, 300); // a hardware key
    expect(r.played.map(([s]) => s)).toEqual(['drum.crash']);
  });
});
