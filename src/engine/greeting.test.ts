import { describe, expect, it } from 'vitest';
import { greeting, praise } from './greeting';

const base = { hour: 9, streak: 0, runs: 0, landedWeek: null, landedLastWeek: null };

describe('greeting', () => {
  it('welcomes a first-timer and names the activity by its tool, not by title (the card shows it)', () => {
    expect(greeting({ ...base, next: { tool: 'jam' } })).toBe('Morning! Welcome to the kit. We start with a jam: just play along and enjoy. Ready?');
    expect(greeting({ ...base, hour: 20, runs: 3, next: { tool: 'copy' } })).toBe('Evening! Good to see you. I play a little rhythm, you copy it. Ready?');
    expect(greeting({ ...base, hour: 20, runs: 3, streak: 2, next: { tool: 'drill' } })).toBe('Evening! 2 days in a row, love it. Ready?');
  });
  it('praises real progress first, then the streak', () => {
    const next = { tool: 'drill' as const };
    expect(greeting({ ...base, runs: 9, streak: 3, landedWeek: 84, landedLastWeek: 74, next })).toMatch(/landing more often/);
    expect(greeting({ ...base, runs: 9, streak: 3, landedWeek: 70, landedLastWeek: 74, next })).toMatch(/3 days in a row/);
  });
  it('says the set is done with its minutes and streak, and offers a jam or the next lesson', () => {
    expect(greeting({ ...base, hour: 14, runs: 5 })).toBe("Hey! That's today's set done! Want to jam a bit more?");
    expect(greeting({ ...base, hour: 14, runs: 5, streak: 3, minutesToday: 24.4, setDone: true, next: { tool: 'drill' } }))
      .toBe("Hey! That's today's set done: 24 minutes and a 3-day streak! Keep going, or have some fun.");
    expect(greeting({ ...base, hour: 14, runs: 5, pathDone: true })).toMatch(/^Hey! All stages done\./);
  });
});

describe('praise', () => {
  it('varies from take to take', () => {
    expect(new Set([0, 1, 2, 3, 4, 5].map(praise)).size).toBe(6);
    expect(praise(7)).toBe(praise(1));
  });
});
