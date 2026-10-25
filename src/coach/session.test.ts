import { describe, expect, it } from 'vitest';
import { coachLine, replyFor, screenAction, thinkingAbout, type CoachState } from './session';
import type { Finished } from '../play/player';

const take = (startedAt: string) => ({ startedAt }) as Finished;
const reply = { say: 'about the song' } as CoachState['reply'];

describe('which take a coach reply belongs to', () => {
  const song = take('2026-10-25T18:00:00Z'), kick = take('2026-10-25T18:01:00Z');
  it('a reply about the last lesson never shows under the next lesson\'s take', () => {
    const s: CoachState = { status: 'idle', reply, at: Date.parse('2026-10-25T18:02:00Z'), take: song };
    expect(replyFor(s, song, 0)).toBe(reply);
    expect(replyFor(s, kick, 0)).toBeUndefined(); // arrived after the kick take started, but it's about the song
  });
  it('while the coach thinks about a new take, the old reply stays with its own take', () => {
    const s: CoachState = { status: 'thinking', reply, at: Date.parse('2026-10-25T18:02:00Z'), take: song, thinking: kick };
    expect(replyFor(s, kick, 0)).toBeUndefined();
    expect(thinkingAbout(s, kick)).toBe(true);
    expect(thinkingAbout(s, song)).toBe(false);
  });
  it('a spoken answer (no take) shows if it came after the take started', () => {
    const s: CoachState = { status: 'idle', reply, at: Date.parse('2026-10-25T18:02:00Z') };
    expect(replyFor(s, kick, 0)).toBe(reply);
    expect(replyFor(s, take('2026-10-25T18:03:00Z'), 0)).toBeUndefined();
  });
});

describe('the big coach line', () => {
  it('shows the coach\'s answer over a plain verdict', () => {
    expect(coachLine('Same tempo, once more.', { say: 'Lift the foot sooner.' }, false)).toEqual({ line: 'Lift the foot sooner.' });
    expect(coachLine('Same tempo, once more.', undefined, false)).toEqual({ line: 'Same tempo, once more.' });
  });
  it('keeps a big moment (record, rank up, lesson done) and puts the coach under it', () => {
    expect(coachLine('🏆 NEW RECORD: 95 BPM!', { say: 'What a take.' }, true)).toEqual({ line: '🏆 NEW RECORD: 95 BPM!', under: 'What a take.' });
    expect(coachLine('🏆 NEW RECORD: 95 BPM!', undefined, true)).toEqual({ line: '🏆 NEW RECORD: 95 BPM!' });
  });
});

describe('the coach\'s button', () => {
  const exists = (id: string) => id === 'rock-basic' || id === 'lesson/money-beat';
  it('"next" gets the screen\'s own label: the coach can\'t name steps that don\'t exist', () => {
    expect(screenAction({ kind: 'next', label: 'Next posture step' }, 'Next ▶', exists)).toEqual({ kind: 'next', label: 'Next ▶' });
  });
  it('a drill with an unknown target is dropped; a known one or a new chart stays', () => {
    expect(screenAction({ kind: 'drill', label: 'Try this', chartId: 'made-up' }, 'Next ▶', exists)).toBeUndefined();
    expect(screenAction({ kind: 'drill', label: 'Try this', chartId: 'lesson/nope' }, 'Next ▶', exists)).toBeUndefined();
    expect(screenAction({ kind: 'drill', label: 'Try this' }, 'Next ▶', exists)).toBeUndefined();
    expect(screenAction({ kind: 'drill', label: 'Money beat', chartId: 'lesson/money-beat' }, 'Next ▶', exists)?.label).toBe('Money beat');
    const chart = { title: 'x', bpm: 80, timeSignature: [4, 4] as [number, 4], bars: 1, notes: [{ t: 0, drum: "snare" as const }] };
    expect(screenAction({ kind: 'drill', label: 'One bar', chart }, 'Next ▶', exists)?.chart).toBe(chart);
    expect(screenAction({ kind: 'slower', label: 'Slower' }, 'Next ▶', exists)).toEqual({ kind: 'slower', label: 'Slower' });
    expect(screenAction(undefined, 'Next ▶', exists)).toBeUndefined();
  });
});
