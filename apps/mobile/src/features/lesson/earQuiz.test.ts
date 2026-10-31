import { describe, expect, it } from 'vitest';
import { pattern, type Chart } from '@drum-coach/core/engine/chart';
import { kickChart, quizRound } from '@drum-coach/core/engine/earQuiz';
import { daySeed, padAnswer, question, roundClips, roundOf, summary, verdict } from './earQuiz';

const bar: Chart = { title: 'Bar', bpm: 70, timeSignature: [4, 4], bars: 2, notes: pattern({ snare: 'xxxxxxxx' }, 2) };

describe('ear quiz (web src/lesson/EarQuiz.tsx)', () => {
  it('answers from the kit: hi-hat (open too) 1, snare 2, floor 3, tom 2 again, the rest nothing', () => {
    expect([padAnswer('hhClosed'), padAnswer('hhOpen'), padAnswer('snare'), padAnswer('floor'), padAnswer('tom2'), padAnswer('kick'), padAnswer(undefined)])
      .toEqual([0, 0, 1, 2, 'again', null, null]);
  });

  it('rounds are core\'s, seeded per day', () => {
    const seed = daySeed(Date.UTC(2026, 9, 31, 15));
    expect(seed).toBe(Math.floor(Date.UTC(2026, 9, 31, 15) / 86_400_000) * 10);
    expect(roundOf('kick', 2, seed)).toEqual(quizRound('kick', 2 + seed));
  });

  it('plays A then B (one rushing) or the groove with its kick line', () => {
    const [a, b] = roundClips('steady', bar, 0);
    expect(a).toBe(bar);
    expect(b.title).toBe('Bar (rushed)');
    expect(roundClips('steady', bar, 1)[1]).toBe(bar);
    expect(roundClips('kick', bar, 2)).toEqual([kickChart(2)]);
  });

  it('words as the web', () => {
    expect(question('steady')).toBe('Listen to A, then B. Which one was steady?');
    expect(question('kick')).toBe('Listen. Where is the kick?');
    expect(verdict({ options: ['A was steady', 'B was steady'], answer: 1 }, 1)).toEqual({ ok: true, text: '✓ Right!' });
    expect(verdict({ options: ['A was steady', 'B was steady'], answer: 1 }, 0)).toEqual({ ok: false, text: 'Not quite: B was the one.' });
    expect([summary(4), summary(2), summary(1)]).toEqual(['4 of 4 right. Great ears!', '2 of 4 right. Nice listening.', '1 of 4 right. Your ears get sharper every time.']);
  });
});
