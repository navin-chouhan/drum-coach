import { beatsPerBar } from './chart.ts';
import type { Lesson, Step } from './lesson.ts';
import { cutBars } from './transcribe.ts';

// A song at the centre of every stage (R8): each stage has a built-in song (with the band); a long one is learned in
// bites first. A real song picked for the stage (Profile.song) takes its place on the trail.

/** The stage's built-in song: the last song lesson of that level (not a bite lesson, not a coach or YouTube one). */
export const stageSong = (level: number, lessons: Lesson[]) =>
  [...lessons].reverse().find(l => l.level === level && l.kind === 'song' && l.source !== 'ai' && !l.id.startsWith('bite-') && !l.id.startsWith('song-yt-'));

/**
 * "Learn it in bites": a song of 16+ bars as a lesson of 4-bar chunks (8-bar for longer songs), each step those bars of
 * the song (`bite` says which, so the takes count towards the song's bars ready), from 10 BPM under the song's start.
 */
export function biteLesson(song: Lesson): Lesson | undefined {
  const full = song.steps[song.steps.length - 1], c = full.chart;
  if (c.bars < 16) return undefined;
  const size = c.bars > 16 ? 8 : 4, bpb = beatsPerBar(c), id = `bite-${song.id}`, name = song.title.replace(/^Song: /, '');
  const steps: Step[] = [];
  for (let from = 1; from <= c.bars; from += size) {
    const to = Math.min(c.bars, from + size - 1), title = `Bars ${from}–${to}`;
    steps.push({ ...full, title, text: `Bars ${from} to ${to} of ${name}, on a loop with the band.`, fadeClick: undefined, freeBars: undefined, variants: undefined, bars: undefined,
      pass: undefined, // a bite is practice: the stage's bar, no song-wide limits
      chart: { ...c, id: `lesson/${id}/${steps.length + 1}`, title: `${name} in bites · ${title}`, bars: to - from + 1, notes: cutBars(c.notes, bpb, from, to) },
      bpm: { start: Math.max(40, full.bpm.start - 10), target: full.bpm.target }, bite: { songId: song.id, fromBar: from, toBar: to, title: name } });
  }
  return { ...song, id, title: `${name} in bites`, steps, demo: undefined,
    what: `${name}, a few bars at a time, until you can play it all the way through.`,
    why: 'Long songs are learned in chunks. Every chunk you can play counts towards the whole song.',
    how: 'Loop each chunk until it feels easy, then the next. The band plays along; the click helps you find "1".' };
}
