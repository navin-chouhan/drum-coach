import { describe, expect, it } from 'vitest';
import { replyFor, thinkingAbout, type CoachState } from './session';
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
