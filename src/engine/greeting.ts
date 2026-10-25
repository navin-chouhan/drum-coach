import type { Tool } from './lesson.ts';

// The coach's line on the Journey screen, from simple rules so it works offline. A coach-written lesson brings its
// own "focus" sentence, which takes the middle of the line.
export type GreetingInput = {
  hour: number; streak: number; runs: number;
  landedWeek: number | null; landedLastWeek: number | null;
  next?: { title: string; tool: Tool; minutes: number; focus?: string };
};

export function greeting(g: GreetingInput): string {
  const hello = g.hour < 12 ? 'Morning!' : g.hour < 18 ? 'Hey!' : 'Evening!';
  const praise = !g.runs ? 'Welcome to the kit.'
    : g.landedWeek !== null && g.landedLastWeek !== null && g.landedWeek > g.landedLastWeek ? 'Your notes are landing more often than last week. 👏'
    : g.streak >= 2 ? `${g.streak} days in a row, love it.` : 'Good to see you.';
  if (!g.next) return `${hello} That's today's set done. Want to jam a bit more?`;
  const { title, tool, minutes, focus } = g.next;
  // A long, technical focus sentence makes a wall of text: then the tool says it.
  const what = focus && focus.length <= 140 ? `Next: ${title}. ${focus}`
    : tool === 'jam' ? `Today we start with a jam, "${title}". Just play along and enjoy.`
    : tool === 'copy' ? `Today: "${title}". I play a little rhythm, you copy it.`
    : tool === 'challenge' ? `Today: a mini challenge, "${title}".`
    : `Today: "${title}", about ${minutes} minutes.`;
  return `${hello} ${praise} ${what} Ready?`;
}
