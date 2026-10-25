import type { Tool } from './lesson.ts';

// The coach's line on the Journey screen, from simple rules so it works offline. A coach-written lesson brings its
// own "focus" sentence, which takes the middle of the line.
export type GreetingInput = {
  hour: number; streak: number; runs: number;
  landedWeek: number | null; landedLastWeek: number | null;
  next?: { title: string; tool: Tool; minutes: number; focus?: string };
  setDone?: boolean; // today's set is done; `next` is the next lesson on the path
  pathDone?: boolean; // every stage passed
};

export function greeting(g: GreetingInput): string {
  const hello = g.hour < 12 ? 'Morning!' : g.hour < 18 ? 'Hey!' : 'Evening!';
  const praise = !g.runs ? 'Welcome to the kit.'
    : g.landedWeek !== null && g.landedLastWeek !== null && g.landedWeek > g.landedLastWeek ? 'Your notes are landing more often than last week. 👏'
    : g.streak >= 2 ? `${g.streak} days in a row, love it.` : 'Good to see you.';
  if (g.pathDone) return `${hello} All stages done. Keep it sharp: flow on your newest groove, or let me write you a challenge.`;
  if (!g.next) return `${hello} That's today's set done. Want to jam a bit more?`;
  if (g.setDone) return `${hello} That's today's set done. On a roll? Next on your path: "${g.next.title}", about ${g.next.minutes} minutes.`;
  const { title, tool, minutes, focus } = g.next;
  // A long, technical focus sentence makes a wall of text: then the tool says it.
  const what = focus && focus.length <= 140 ? `Next: ${title}. ${focus}`
    : tool === 'jam' ? `Today we start with a jam, "${title}". Just play along and enjoy.`
    : tool === 'copy' ? `Today: "${title}". I play a little rhythm, you copy it.`
    : tool === 'bite' ? `Today: "${title}", a few bars of a real song.`
    : tool === 'trade' ? `Today: "${title}". I play a bar, you answer with anything you like.`
    : tool === 'free' ? `Today: "${title}", with a bar that's all yours.`
    : tool === 'challenge' ? `Today: a mini challenge, "${title}".`
    : tool === 'layers' ? `Today: "${title}", built one limb at a time while I play the rest.`
    : `Today: "${title}", about ${minutes} minutes.`;
  return `${hello} ${praise} ${what} Ready?`;
}
