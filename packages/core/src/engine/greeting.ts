import type { Tool } from './lesson.ts';

// The coach's line on the Journey screen, from simple rules so it works offline. The lesson's title, what it is and
// the coach's reason sit on the big lesson card under it, so the line stays short.
export type GreetingInput = {
  hour: number; streak: number; runs: number;
  landedWeek: number | null; landedLastWeek: number | null;
  next?: { tool: Tool };
  setDone?: boolean; // today's set is done; `next` is the next lesson on the path
  minutesToday?: number; // for the "set done" line
  pathDone?: boolean; // every stage passed
};

export function greeting(g: GreetingInput): string {
  const hello = g.hour < 12 ? 'Morning!' : g.hour < 18 ? 'Hey!' : 'Evening!';
  const praise = !g.runs ? 'Welcome to the kit.'
    : g.landedWeek !== null && g.landedLastWeek !== null && g.landedWeek > g.landedLastWeek ? 'Your notes are landing more often than last week. 👏'
    : g.streak >= 2 ? `${g.streak} days in a row, love it.` : 'Good to see you.';
  if (g.pathDone) return `${hello} All stages done. Keep it sharp: flow on your newest groove, or let me write you a challenge.`;
  const done = `${hello} That's today's set done${g.minutesToday ? `: ${Math.round(g.minutesToday)} minutes` : ''}${g.streak >= 2 ? ` and a ${g.streak}-day streak` : ''}!`;
  if (!g.next) return `${done} Want to jam a bit more?`;
  if (g.setDone) return `${done} Keep going, or have some fun.`;
  const what = { jam: 'We start with a jam: just play along and enjoy.', copy: 'I play a little rhythm, you copy it.', bite: 'A few bars of a real song.',
    trade: 'I play a bar, you answer with anything you like.', free: 'One bar is all yours.', challenge: 'A mini challenge.',
    layers: 'We build it one limb at a time while I play the rest.', drill: '' }[g.next.tool];
  return `${hello} ${praise} ${what ? `${what} ` : ''}Ready?`;
}

const PRAISE = ['Nice!', 'Lovely.', "That's it!", 'Solid.', 'Good one.', 'Yes!'];
/** A word of praise that changes from take to take (the same `n` gives the same word), so it doesn't feel canned. */
export const praise = (n: number) => PRAISE[((n % PRAISE.length) + PRAISE.length) % PRAISE.length];
