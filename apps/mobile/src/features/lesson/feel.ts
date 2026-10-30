// The feel a step asks for, over the live tip window (swing %, the sheet's volume marks this bar vs the one before).
// Copied from src/play/player.ts liveCheck, for the local take until core's createTake (A4p2) replaces it.
import { swingPct } from '@drum-coach/core/engine/feel';
import type { LiveWindow } from '@drum-coach/core/engine/liveCoach';
import type { Run } from '@drum-coach/core/engine/run';
import type { NoteResult } from '@drum-coach/core/engine/scoring';
import type { PlayOptions } from './types';

export function feelNow(run: Run, inWin: number[], results: NoteResult[], beatMs: number, o: PlayOptions, marks: (number | undefined)[] | undefined, bar: number): Pick<LiveWindow, 'swing' | 'dyn'> {
  const swing = o.swingWant ? { now: swingPct({ ...run, notes: inWin.map(i => run.notes[i]) }, inWin.map(i => results[i]), beatMs), want: o.swingWant } : undefined;
  const sec = o.toBar - o.fromBar + 1, markOf = (b: number) => marks?.[o.fromBar - 1 + (((b % sec) + sec) % sec)];
  const vel = (b: number) => { const v = inWin.filter(i => run.notes[i].bar === b).flatMap(i => results[i].velocity ?? []); return v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0; };
  const dyn = marks && bar >= 2 && markOf(bar - 1) !== undefined && markOf(bar - 2) !== undefined ? { want: markOf(bar - 1)!, prevWant: markOf(bar - 2)!, got: vel(bar - 1), prevGot: vel(bar - 2) } : undefined;
  return { swing, dyn: dyn && dyn.got && dyn.prevGot ? dyn : undefined };
}
