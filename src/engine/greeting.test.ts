import { describe, expect, it } from 'vitest';
import { greeting, praise } from './greeting';

const base = { hour: 9, streak: 0, runs: 0, landedWeek: null, landedLastWeek: null };

describe('greeting', () => {
  it('welcomes a first-timer and names the activity by its tool', () => {
    expect(greeting({ ...base, next: { title: 'Your first jam', tool: 'jam', minutes: 5 } }))
      .toBe('Morning! Welcome to the kit. Today we start with a jam, "Your first jam". Just play along and enjoy. Ready?');
    expect(greeting({ ...base, hour: 20, runs: 3, next: { title: 'Echo game', tool: 'copy', minutes: 5 } })).toMatch(/^Evening! Good to see you\. .*you copy it\. Ready\?$/);
  });
  it('praises real progress first, then the streak', () => {
    const next = { title: 'X', tool: 'drill' as const, minutes: 12 };
    expect(greeting({ ...base, runs: 9, streak: 3, landedWeek: 84, landedLastWeek: 74, next })).toMatch(/landing more often/);
    expect(greeting({ ...base, runs: 9, streak: 3, landedWeek: 70, landedLastWeek: 74, next })).toMatch(/3 days in a row/);
  });
  it("uses the coach's focus sentence, and offers a jam when the set is done", () => {
    expect(greeting({ ...base, runs: 1, next: { title: 'Say "and"', tool: 'copy', minutes: 8, focus: 'Your quarters are solid.' } }))
      .toMatch(/Next: Say "and"\. Your quarters are solid\. Ready\?$/);
    expect(greeting({ ...base, runs: 1, next: { title: 'T', tool: 'copy', minutes: 8, focus: 'x'.repeat(200) } })).toMatch(/you copy it/);
    expect(greeting({ ...base, hour: 14, runs: 5 })).toBe("Hey! That's today's set done. Want to jam a bit more?");
    // set done, but more on the path: offer the next lesson
    expect(greeting({ ...base, hour: 14, runs: 5, setDone: true, next: { title: 'Hi-hat 8th notes', tool: 'drill', minutes: 8 } }))
      .toBe('Hey! That\'s today\'s set done. On a roll? Next on your path: "Hi-hat 8th notes", about 8 minutes.');
    expect(greeting({ ...base, hour: 14, runs: 5, pathDone: true })).toMatch(/^Hey! All stages done\./);
  });
});

describe('praise', () => {
  it('varies from take to take', () => {
    expect(new Set([0, 1, 2, 3, 4, 5].map(praise)).size).toBe(6);
    expect(praise(7)).toBe(praise(1));
  });
});
