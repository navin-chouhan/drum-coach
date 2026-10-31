import { CALIBRATION_ORDER, DEBOUNCE_MS } from '@drum-coach/core/engine/calibration';
import { DEFAULT_NOTE_MAP } from '@drum-coach/core/engine/kit';
import type { KeyValueStore } from '@drum-coach/core/platform';
import { describe, expect, it } from 'vitest';
import { conflictText, kitStoreVersion, noteMapSummary, noteRows, readNoteMap, readPadCal, withNote, writeNoteMap, writePadCal } from './kitStore';
import { startWizard, wizardKey, wizardReduce, wizardSave, wizardView, type WizardState } from './padWizard';
import { SETTLE_MS, VELOCITY_PADS, calSummary, nextPad, startVelocity, stopVelocity, velocityNote, velocityTick, velocityView, type VelocityState } from './velocityWizard';

const memKv = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: k => data.get(k) ?? null, set: (k, v) => { data.set(k, v); }, remove: k => { data.delete(k); } };
};
const map = { ...DEFAULT_NOTE_MAP };

describe('kit store', () => {
  it('keeps note maps and pad calibration per kit under the web keys', () => {
    const kv = memKv();
    expect(readNoteMap(kv, 'e-Drum')).toEqual(DEFAULT_NOTE_MAP);
    const v = kitStoreVersion();
    writeNoteMap(kv, 'e-Drum', { ...map, tom1: 47 });
    expect(kitStoreVersion()).toBe(v + 1);
    expect(kv.data.has('drumcoach.noteMap.e-Drum')).toBe(true);
    expect(readNoteMap(kv, 'e-Drum').tom1).toBe(47);
    expect(readNoteMap(kv, 'other').tom1).toBe(48);
    writePadCal(kv, 'e-Drum', { snare: { soft: 20, loud: 110 } });
    expect(readPadCal(kv, 'e-Drum').snare?.loud).toBe(110);
    kv.set('drumcoach.padCal.bad', '[1]');
    expect(readPadCal(kv, 'bad')).toEqual({});
  });
  it('checks edits and names clashes with the module fix', () => {
    expect(withNote(map, 'tom1', 128)).toBeNull();
    expect(withNote(map, 'tom1', 1.5)).toBeNull();
    const clash = withNote(map, 'tom1', 49)!;
    expect(conflictText(map)).toBeNull();
    expect(conflictText(clash)).toMatch(/^Tom 1 and Crash share a note\. .*VOICE lights/);
    expect(noteRows(clash).filter(r => r.conflict).map(r => r.pad)).toEqual(['tom1', 'crash']);
    expect(noteMapSummary(map)).toBe('MPS-150 defaults');
    expect(noteMapSummary({ ...map, tom1: 47 })).toBe('MPS-150 defaults, tom 1 = 47');
    expect(noteMapSummary(clash)).toBe('tom 1 = 49 · two pads share a note');
  });
});

describe('hit each pad', () => {
  const hitAll = (notes: number[]) => {
    let s: WizardState = startWizard();
    notes.forEach((n, i) => { s = wizardReduce(s, { kind: 'hit', note: n, time: 1000 + i * (DEBOUNCE_MS + 1) }, map); });
    return s;
  };
  const defaults = CALIBRATION_ORDER.map(p => DEFAULT_NOTE_MAP[p]);

  it('walks the core order and saves the captured notes with today', () => {
    const s = hitAll(defaults);
    const v = wizardView(s, map, 'e-Drum');
    expect(v.done).toBe(true);
    expect(v.title).toBe('All done!');
    expect(v.kicker).toBe('All pads · e-Drum');
    expect(v.rows.every(r => r.state === 'ok')).toBe(true);
    expect(Object.values(v.spots).every(x => x === 'ok')).toBe(true);
    const saved = wizardSave(s, map, new Date(2026, 9, 28));
    expect(saved.map).toEqual(DEFAULT_NOTE_MAP);
    expect(saved.settings.padsCheckedAt).toBe('2026-10-28');
  });

  it('shows the pad to hit big, with its hint, and the drawing state', () => {
    const s = hitAll(defaults.slice(0, 5));
    const v = wizardView(s, map, 'e-Drum');
    expect(v.kicker).toBe('Pad 6 of 10 · e-Drum');
    expect(v.title).toBe('Hit TOM 1');
    expect(v.hint).toBe('The small tom on the left, above the snare.');
    expect(v.spots.tom1).toBe('now');
    expect(v.spots.hihat).toBe('ok');
    expect(v.spots.crash).toBe('waiting');
    expect(v.rows[5]).toMatchObject({ name: 'Tom 1', value: '…', state: 'now' });
    expect(v.skipKeeps).toBe('keeps 48');
    // the hi-hat isn't done until both open and closed are in
    expect(wizardView(hitAll(defaults.slice(0, 3)), map, 'x').spots.hihat).toBe('waiting');
  });

  it('stops on a duplicate note with the module fix, and says which pad a wrong note belongs to', () => {
    let s = hitAll(defaults.slice(0, 5));
    s = wizardReduce(s, { kind: 'hit', note: 45, time: 99_000 }, map); // tom 2 hit when tom 1 was asked
    let v = wizardView(s, map, 'e-Drum');
    expect(v.toast).toBe("That sent tom 2's note (45). If you hit tom 2 by mistake, go back.");
    expect(v.current).toBe('tom2');
    s = wizardReduce(s, { kind: 'hit', note: 45, time: 100_000 }, map);
    v = wizardView(s, map, 'e-Drum');
    expect(v.conflict).toMatch(/^Note 45 is already used by Tom 1, so the app can't tell these pads apart\..*Then hit it again\.$/);
    expect(v.toast).toBeNull();
    s = wizardReduce(s, { kind: 'back' }, map);
    expect(wizardView(s, map, 'e-Drum').current).toBe('tom1');
  });

  it('debounces, skips (keeping the old note) and maps keys', () => {
    let s = startWizard();
    s = wizardReduce(s, { kind: 'hit', note: 36, time: 1000 }, map);
    const same = wizardReduce(s, { kind: 'hit', note: 38, time: 1100 }, map);
    expect(same).toBe(s);
    s = wizardReduce(s, { kind: 'skip' }, map);
    expect(wizardView(s, map, 'k').rows[1]).toMatchObject({ value: 'kept 38', state: 'kept' });
    expect(wizardKey('left')).toBe('back');
    expect(wizardKey('escape')).toBe('stop');
    expect(wizardKey('enter')).toBeNull();
    expect(wizardKey('h')).toBeNull();
  });
});

describe('soft, then loud', () => {
  const feed = (s: VelocityState, pad: (typeof VELOCITY_PADS)[number], vels: [number, number][]) =>
    vels.reduce((st, [t, v]) => velocityNote(st, map, map[pad], v, t).state, s);

  it('measures four soft and four loud strokes per pad, retriggers included, after the settle time', () => {
    let s = feed(startVelocity(), 'kick', [[0, 20], [500, 22], [1000, 18], [1500, 24]]);
    expect(s.phase).toBe('loud');
    s = feed(s, 'kick', [[2000, 110], [2050, 60], [2500, 112], [3000, 108], [3500, 115]]);
    expect(s.finishAt).toBe(3500 + SETTLE_MS);
    expect(velocityView(s).loudDots).toBe('●●●●');
    expect(velocityTick(s, 3600, {}).state).toBe(s);
    const r = velocityTick(s, 3800, {});
    expect(r.state.i).toBe(1);
    expect(r.state.done.kick).toMatchObject({ soft: 21, loud: 111, bounceMs: 60 });
    expect(velocityView(r.state).prompt).toBe('Snare: four soft taps (3 cm)');
  });

  it('ignores other pads and note offs; saves on the last pad and on Stop', () => {
    const s = startVelocity();
    expect(velocityNote(s, map, 38, 50, 0).state).toBe(s);
    expect(velocityNote(s, map, 36, 0, 0).state).toBe(s);
    let st: VelocityState = { ...s, i: VELOCITY_PADS.length - 1, done: { snare: { soft: 30, loud: 100 } } };
    const end = nextPad(st, { kick: { soft: 1, loud: 2 } });
    expect(end.state.on).toBe(false);
    expect(end.save).toEqual({ kick: { soft: 1, loud: 2 }, snare: { soft: 30, loud: 100 } });
    st = { ...s, done: {} };
    expect(stopVelocity(st, {}).save).toBeUndefined();
    expect(calSummary({ snare: { soft: 30, loud: 100, bounceMs: 70, bounceRatio: 0.7 }, kick: { soft: 20, loud: 90 } })).toEqual([
      { pad: 'snare', name: 'Snare', text: 'soft 30, loud 100 · retriggers within 70 ms at under 70%: filtered' },
      { pad: 'kick', name: 'Kick', text: 'soft 20, loud 90 · no retriggers seen' },
    ]);
  });
});
