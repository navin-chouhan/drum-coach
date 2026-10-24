import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_MAP, findConflicts, padForNote, parseNoteMap } from './kit';

describe('note map', () => {
  it('maps the verified MPS-150 notes', () => {
    expect(padForNote(DEFAULT_NOTE_MAP, 36)).toBe('kick');
    expect(padForNote(DEFAULT_NOTE_MAP, 48)).toBe('tom1');
    expect(padForNote(DEFAULT_NOTE_MAP, 46)).toBe('hhOpen');
    expect(padForNote(DEFAULT_NOTE_MAP, 42)).toBe('hhClosed');
    expect(padForNote(DEFAULT_NOTE_MAP, 44)).toBe('hhPedal');
    expect(padForNote(DEFAULT_NOTE_MAP, 60)).toBeUndefined();
    expect(findConflicts(DEFAULT_NOTE_MAP)).toEqual([]);
  });

  it('flags the tom-on-49 mistake as a conflict with crash', () => {
    expect(findConflicts({ ...DEFAULT_NOTE_MAP, tom1: 49 })).toEqual([['tom1', 'crash']]);
  });

  it('parses stored maps defensively', () => {
    expect(parseNoteMap(null)).toEqual(DEFAULT_NOTE_MAP);
    expect(parseNoteMap('not json')).toEqual(DEFAULT_NOTE_MAP);
    expect(parseNoteMap('{"tom1":50,"kick":"x","snare":200}')).toEqual({ ...DEFAULT_NOTE_MAP, tom1: 50 });
  });
});
