import { describe, expect, it } from 'vitest';

import { cleanPreferredNames, selectTarget, type SelectableSource, type SelectionState } from './selection';

const kit = (id = '101', online = true): SelectableSource => ({ id, name: 'e-Drum', online });
const net: SelectableSource = { id: '7', name: 'Network Session 1', online: true };
const none: SelectionState = { selectedId: null, selectedName: null, preferredNames: ['e-Drum'], autoSelect: true };

// ios/Tests/InputSelectionTests.swift checks the Swift mirror on the same cases.
describe('selectTarget', () => {
  it('auto-selects the preferred kit when it appears', () => {
    expect(selectTarget([net], none)).toBeNull();
    expect(selectTarget([net, kit()], none)).toEqual(kit());
  });

  it('matches by prefix, case-insensitively (Linux shows "e-Drum MIDI 1")', () => {
    const linuxName = { id: '3', name: 'e-Drum MIDI 1', online: true };
    expect(selectTarget([linuxName], { ...none, preferredNames: ['E-DRUM'] })).toEqual(linuxName);
  });

  it('tries the preferred names in order, then name, then id', () => {
    const a = { id: '9', name: 'Alpha Pads', online: true };
    const k2 = kit('50');
    expect(selectTarget([a, kit('101'), k2], { ...none, preferredNames: ['e-Drum', 'Alpha'] })).toEqual(k2);
    expect(selectTarget([a, kit('101')], { ...none, preferredNames: ['Alpha', 'e-Drum'] })).toEqual(a);
  });

  it('ignores offline sources', () => {
    expect(selectTarget([kit('101', false)], none)).toBeNull();
  });

  it('does nothing with auto-select off (after select(null))', () => {
    expect(selectTarget([kit()], { ...none, autoSelect: false })).toBeNull();
  });

  it('an explicit selection wins over the preferred names', () => {
    expect(selectTarget([kit(), net], { ...none, selectedId: '7', selectedName: net.name })).toEqual(net);
  });

  it('a selected source that went offline stays selected: nothing else is picked', () => {
    expect(selectTarget([{ ...net, online: false }, kit()], { ...none, selectedId: '7', selectedName: net.name })).toBeNull();
  });

  it('re-selects by name after a replug with a new id', () => {
    const state = { ...none, selectedId: '101', selectedName: 'e-Drum' };
    expect(selectTarget([kit('101', false), kit('202')], state)).toEqual(kit('202'));
  });

  it('prefers the selected id over another source with the same name', () => {
    const state = { ...none, selectedId: '202', selectedName: 'e-Drum' };
    expect(selectTarget([kit('101'), kit('202')], state)).toEqual(kit('202'));
  });

  it('an id selected before it was ever listed has no name to fall back on', () => {
    expect(selectTarget([kit('101')], { ...none, selectedId: '555' })).toBeNull();
  });
});

describe('cleanPreferredNames', () => {
  it('trims and drops empty names, keeping the order', () => {
    expect(cleanPreferredNames([' e-Drum ', '', '  ', 'TD-'])).toEqual(['e-Drum', 'TD-']);
  });
});
