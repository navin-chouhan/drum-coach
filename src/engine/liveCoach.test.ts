import { describe, expect, it } from 'vitest';
import { candidateCues, createLiveCoach, type WindowNote } from './liveCoach';

const groove = (offset: number, over: Partial<WindowNote> = {}): WindowNote[] =>
  Array.from({ length: 16 }, (_, i) => ({ drum: i % 4 === 0 ? 'kick' : 'hihat', judgement: 'good', offset, velocity: 80, pad: 'hhClosed', ...over }));

describe('candidate cues', () => {
  it('dragging and rushing beyond the chattiness threshold', () => {
    expect(candidateCues({ bar: 4, notes: groove(30), extras: 0 }, 'normal')[0].id).toBe('dragging');
    expect(candidateCues({ bar: 4, notes: groove(-25), extras: 0 }, 'normal')[0].id).toBe('rushing');
    expect(candidateCues({ bar: 4, notes: groove(-25), extras: 0 }, 'quiet')).toEqual([]); // quiet waits for 30 ms
    expect(candidateCues({ bar: 4, notes: groove(5), extras: 0 }, 'normal')).toEqual([]);
  });
  it('reacting to the click is a tip even when the offsets look fine', () => {
    expect(candidateCues({ bar: 4, notes: groove(-5), extras: 0, reaction: 180 }, 'quiet')[0].id).toBe('reacting');
  });
  it('a lane missed three times in a row outranks timing', () => {
    const notes = groove(30).map(n => (n.drum === 'kick' ? { ...n, judgement: 'miss' as const, offset: undefined } : n));
    expect(candidateCues({ bar: 4, notes, extras: 0 }, 'normal').map(c => c.id)).toEqual(['missing-kick', 'dragging']);
  });
  it('strokes played off time are a timing tip, not "missing"', () => {
    const notes = groove(0, { judgement: 'miss', offset: undefined, off: -120 });
    expect(candidateCues({ bar: 4, notes, extras: 0 }, 'normal').map(c => c.id)).toEqual(['rushing']);
  });
  it('hi-hat pad sending open where the chart wants closed', () => {
    expect(candidateCues({ bar: 4, notes: groove(0, { pad: 'hhOpen' }), extras: 0 }, 'quiet')[0].id).toBe('hh-open');
  });
  it('dynamics tips only when talkative', () => {
    const notes = groove(0).map((n, i) => ({ ...n, accent: i % 4 === 2, velocity: 80 }));
    expect(candidateCues({ bar: 4, notes, extras: 0 }, 'normal')).toEqual([]);
    expect(candidateCues({ bar: 4, notes, extras: 0 }, 'talkative')[0].id).toBe('accents');
  });
  it('extra hits', () => {
    expect(candidateCues({ bar: 4, notes: groove(0), extras: 4 }, 'normal')[0].id).toBe('extras');
  });
});

describe('live coach gate', () => {
  it('silent in the first bar, then at most once per gap, same tip once per 8 bars, praise after a fix', () => {
    const coach = createLiveCoach('normal');
    const said: string[] = [];
    for (let bar = 0; bar < 20; bar++) {
      const notes = bar < 12 ? groove(30) : groove(0); // drags for 12 bars, then fixed
      const cue = coach({ bar, notes, extras: 0 });
      if (cue) said.push(`${bar}:${cue.id}`);
    }
    expect(said).toEqual(['1:dragging', '9:dragging', '12:praise']);
  });
});

describe('a lay-back target (R4)', () => {
  const notes = (offset: number) => Array.from({ length: 8 }, () => ({ drum: 'snare' as const, judgement: 'good' as const, offset }));
  it('a step that asks for "behind the beat" never hears "Dragging. Push" for doing it', () => {
    expect(candidateCues({ bar: 2, notes: notes(22), extras: 0, target: { ms: 20, tol: 10 } }, 'normal').map(c => c.id)).not.toContain('dragging');
    expect(candidateCues({ bar: 2, notes: notes(0), extras: 0, target: { ms: 20, tol: 10 } }, 'normal').map(c => c.id)).toContain('lay-back');
    expect(candidateCues({ bar: 2, notes: notes(22), extras: 0 }, 'normal').map(c => c.id)).toContain('dragging');
  });
});

describe('feel cues (R4)', () => {
  const notes = Array.from({ length: 8 }, () => ({ drum: 'hihat' as const, judgement: 'good' as const, offset: 0 }));
  it('swing: too straight hears "Swing it", too swung hears "Straighter"', () => {
    expect(candidateCues({ bar: 2, notes, extras: 0, swing: { now: 51, want: [58, 74] } }, 'normal').map(c => c.id)).toContain('swing-more');
    expect(candidateCues({ bar: 2, notes, extras: 0, swing: { now: 80, want: [44, 56] } }, 'normal').map(c => c.id)).toContain('straight');
    expect(candidateCues({ bar: 2, notes, extras: 0, swing: { now: 64, want: [58, 74] } }, 'normal').map(c => c.id)).toEqual([]);
  });
  it('dynamics: the marks go up but you didn\'t, or down', () => {
    expect(candidateCues({ bar: 2, notes, extras: 0, dyn: { want: 3, prevWant: 1, got: 80, prevGot: 82 } }, 'normal').map(c => c.id)).toContain('bring-up');
    expect(candidateCues({ bar: 2, notes, extras: 0, dyn: { want: 1, prevWant: 3, got: 100, prevGot: 98 } }, 'normal').map(c => c.id)).toContain('bring-down');
    expect(candidateCues({ bar: 2, notes, extras: 0, dyn: { want: 3, prevWant: 1, got: 110, prevGot: 70 } }, 'normal').map(c => c.id)).toEqual([]);
  });
});
