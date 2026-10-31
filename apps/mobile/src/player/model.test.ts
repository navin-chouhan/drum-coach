import { describe, expect, it } from 'vitest';
import { barGoal, escAction, phaseOf, scoreParts, takeBarText } from './model';

describe('the shared player (D10)', () => {
  it('draws ready, take or results', () => {
    expect(phaseOf({ playing: false, hasResults: false })).toBe('ready');
    expect(phaseOf({ playing: true, hasResults: true })).toBe('take');
    expect(phaseOf({ playing: false, hasResults: true })).toBe('results');
  });
  it('puts the goal in the bar: "2 clean → 75", the next step, or done; nothing without boxes', () => {
    expect(barGoal({ boxes: { n: 2, ok: 1 }, bpm: 70, target: 90, lastStep: false })).toEqual({ boxes: { n: 2, ok: 1 }, text: '2 clean → 75' });
    expect(barGoal({ boxes: { n: 2, ok: 0 }, bpm: 88, target: 90, lastStep: false })?.text).toBe('2 clean → 90');
    expect(barGoal({ boxes: { n: 2, ok: 0 }, bpm: 90, target: 90, lastStep: false })?.text).toBe('2 clean → next step');
    expect(barGoal({ boxes: { n: 1, ok: 0 }, bpm: 90, target: 90, lastStep: true })?.text).toBe('1 clean → done');
    expect(barGoal({ bpm: 70, target: 90, lastStep: false })).toBeUndefined();
  });
  it('shows the bar during a take, or the count-in', () => {
    expect(takeBarText({ bar: 3, of: 4 })).toBe('Bar 3 / 4');
    expect(takeBarText({ bar: 3 })).toBe('Bar 3');
    expect(takeBarText({ countIn: 2, bar: 0, of: 4 })).toBe('Count-in');
  });
  it('Esc: an open sheet first, then stop a take, else leave', () => {
    expect(escAction({ overlayOpen: true, playing: true })).toBe('none');
    expect(escAction({ overlayOpen: false, playing: true })).toBe('stop');
    expect(escAction({ overlayOpen: false, playing: false })).toBe('back');
  });
  it('splits the score for the card', () => {
    expect(scoreParts(46, 48)).toEqual({ big: '46', of: '/48' });
  });
});
