// The song modes' logic, ported from the web's src/youtube/{TempoMode,LearnMode,JamMode,PlayMode}.tsx without React:
// the same rules, numbers and wording. Pure TypeScript (Vitest-tested); the screens wire it to the player, the hit
// bus and Storage.
import { beatsPerBar, type Chart, type ChartNote } from '@drum-coach/core/engine/chart';
import { scoreJam, type JamHit, type JamStats } from '@drum-coach/core/engine/jam';
import { WINDOWS } from '@drum-coach/core/engine/scoring';
import { alignPhase, beatAt, fitBeatGrid, songSecAt, type BeatGrid } from '@drum-coach/core/engine/tempo';
import type { YtSong } from '@drum-coach/core/youtube/schemas';
import type { RunInput } from '../../data/runs';

/** What the song modes need from the player (ytController.ts, or a fake in tests). */
export type SongPlayer = { readonly playing: boolean; songTime(now?: number): number; seek(sec: number): void; play(): void; pause(): void; readonly duration: number };

// ---------------------------------------------------------------------------------------------------------------
// 1 · Set tempo (TempoMode.tsx)

export const SIGS: YtSong['timeSignature'][] = [[4, 4], [3, 4], [6, 8], [12, 8], [2, 4], [5, 4], [7, 8]];

/** A tap on the beat (song seconds): a pause of over 3 s starts over; the last 48 are kept. */
export const addTap = (taps: number[], t: number) => (taps.length && t - taps[taps.length - 1] > 3 ? [t] : [...taps, t].slice(-48));

/** The grid the taps give: a full fit from 8 taps, or the phase alone from 2 when another version has the tempo. */
export function tapFit(taps: number[], bpb: number, known: BeatGrid | undefined, saved: BeatGrid | undefined): (BeatGrid & { residualMs?: number }) | null {
  if (taps.length >= 8) return fitBeatGrid(taps, bpb);
  return known && !saved && taps.length >= 2 ? alignPhase(taps, known.bpm, bpb) : null;
}
/** Another version's tempo (the first grid the song has), as the web's `known`. */
export const knownGrid = (s: YtSong) => Object.values(s.grids)[0];

export const tempoHelp = (known: boolean, saved: boolean) =>
  `Press Play, then hit any pad (or a key) on every beat, starting on a "1" (the start of a bar).${known && !saved ? ' This song already has a tempo from another version, so 2–4 taps are enough.' : ' About 8–16 taps.'} Pause between tries to start over.`;
export const residualText = (taps: number, residualMs: number) => `${taps} taps · ±${residualMs} ms ${residualMs > 30 ? '(uneven: keep tapping)' : '(steady)'}`;

/** The nudge buttons, in the web's order. */
export const GRID_ADJUST: { label: string; hint?: string; f: (g: BeatGrid) => BeatGrid }[] = [
  { label: '−10 ms', f: g => ({ ...g, offsetSec: g.offsetSec - 0.01 }) },
  { label: '+10 ms', f: g => ({ ...g, offsetSec: g.offsetSec + 0.01 }) },
  { label: '−0.1 BPM', f: g => ({ ...g, bpm: Math.round((g.bpm - 0.1) * 10) / 10 }) },
  { label: '+0.1 BPM', f: g => ({ ...g, bpm: Math.round((g.bpm + 0.1) * 10) / 10 }) },
  { label: '"1" is later', hint: 'The 1 is one beat later', f: g => ({ ...g, offsetSec: g.offsetSec + 60 / g.bpm }) },
  { label: '×2', f: g => ({ ...g, bpm: g.bpm * 2 }) },
  { label: '÷2', f: g => ({ ...g, bpm: g.bpm / 2 }) },
];
/** What Save stores: beat 0 moved to the first bar (0 ≤ offset < one bar). */
export function gridToSave(g: BeatGrid, bpb: number): BeatGrid {
  const bar = (60 / g.bpm) * bpb;
  return { bpm: g.bpm, offsetSec: ((g.offsetSec % bar) + bar) % bar };
}
export const TEMPO_SAVED = 'Saved. Now try Learn by ear or Jam.';

/** "Click along": the beat the song is on and whether a click is due (a new beat ≥ 0; accent on a bar start). */
export function clickDue(lastBeat: number, songSec: number, g: BeatGrid, bpb: number): { beat: number; click: null | 'accent' | 'beat' } {
  const b = Math.floor(beatAt(songSec, g));
  return { beat: b, click: b !== lastBeat && b >= 0 ? (b % Math.round(bpb) === 0 ? 'accent' : 'beat') : null };
}

// ---------------------------------------------------------------------------------------------------------------
// 2 · Learn by ear (LearnMode.tsx)

export type BarRange = { from: number; to: number };
export const clampRange = (from: number, to: number): BarRange => { const f = Math.max(1, Math.floor(from) || 1); return { from: f, to: Math.max(f, Math.floor(to) || f) }; };
export const rangeBeats = (r: BarRange, bpb: number) => ({ fromBeat: (r.from - 1) * bpb, toBeat: r.to * bpb });
export const notesIn = (notes: ChartNote[], fromBeat: number, toBeat: number) => notes.filter(n => n.t >= fromBeat && n.t < toBeat);
export const LEARN_STEPS = [{ value: 4, label: '16ths' }, { value: 3, label: 'triplets' }, { value: 2, label: '8ths' }] as const;
export const LEARN_HELP = 'Loop a few bars (slow them down with Speed), listen, and play what you hear. Each pass shows up as rings; "Use take" copies it into your part, then tap cells to fix notes. Turn on "Hear my part" to compare with the recording.';

/** The loop: one bar of pre-roll before `from`, back there just after the end of `to`. Seconds in the song. */
export const loopSpan = (g: BeatGrid, fromBeat: number, toBeat: number, bpb: number) =>
  ({ preroll: Math.max(0, songSecAt(fromBeat - bpb, g)), end: songSecAt(toBeat, g) });

/**
 * One frame of the loop (the web's requestAnimationFrame tick): the notes of your part to sound between the last
 * frame and this one ("Hear my part"), and whether the pass ended (the caller then keeps the take and seeks back).
 */
export function loopFrame(o: { prev: number; t: number; end: number; draft: ChartNote[]; hear: boolean; playing: boolean; grid: BeatGrid }) {
  const prev = o.t < o.prev ? o.t : o.prev;
  const sound = o.hear && o.playing ? o.draft.filter(n => { const at = songSecAt(n.t, o.grid); return at > prev && at <= o.t; }) : [];
  return { sound, passEnded: o.t >= o.end + 0.05 };
}
/** A pass where you mostly listened shouldn't wipe a fuller take you just played. */
export const keepTake = (prev: ChartNote[], pass: ChartNote[]) => (pass.length && pass.length * 2 >= prev.length ? pass : prev);
/** A synth velocity for your part's note (accent 120, ghost 40, else 90). */
export const hearVelocity = (n: ChartNote) => (n.accent ? 120 : n.ghost ? 40 : 90);
/** Adds notes the draft doesn't have yet (Use suggestions / Use what both agree on). */
export const addMissing = (draft: ChartNote[], add: ChartNote[]) =>
  [...draft, ...add.filter(s => !draft.some(n => n.t === s.t && n.drum === s.drum)).map(({ t, drum }) => ({ t, drum }))].sort((a, b) => a.t - b.t);
export const learnSaved = (r: BarRange) => `Saved bars ${r.from}–${r.to}. Move on to the next bars, or try Play (scored).`;

/** The coach's groove (POST /api/coach/groove): its cache key and request, as the web. */
export const grooveKey = (s: YtSong, g: BeatGrid) => `groove:${s.id}:${Math.round(g.bpm)}:${s.timeSignature.join('/')}`;
export const grooveRequest = (s: YtSong, g: BeatGrid, again = false) => ({ title: s.title, bpm: Math.round(g.bpm), timeSignature: s.timeSignature, ...(again && { again }) });
/** The coach's groove tiled over bars A–B. */
export function tileGroove(c: Pick<Chart, 'bars' | 'timeSignature' | 'notes'> | undefined, fromBeat: number, toBeat: number): ChartNote[] {
  if (!c) return [];
  const len = c.bars * beatsPerBar(c), tiled: ChartNote[] = [];
  if (!(len > 0)) return [];
  for (let off = fromBeat; off < toBeat; off += len) for (const n of c.notes) if (n.t + off < toBeat) tiled.push({ ...n, t: n.t + off });
  return tiled.sort((a, b) => a.t - b.t);
}
export const VERIFY = {
  done: (day: string) => `✓ You checked this part by ear on ${day}. Changing notes asks you to check again.`,
  todo: "Before this can be a show-off song, check the part by ear: play bars along with the original (Hear my part, Play) and fix what doesn't match.",
  mark: '✓ I checked the part by ear: it matches the record',
  unmark: 'Mark as not checked',
};

// ---------------------------------------------------------------------------------------------------------------
// 3 · Jam (JamMode.tsx)

export const JAM_STEPS = [{ value: 1, label: 'quarter notes' }, { value: 2, label: '8th notes' }, { value: 4, label: '16th notes' }] as const;
export const JAM_HELP = "Play anything that fits the song. You're scored against the song's beat, with no chart needed.";
/** ms from the nearest grid step, in real ms (the playback rate removed). */
export function jamOffset(songSec: number, g: BeatGrid, steps: number, rate: number) {
  const step = Math.round(beatAt(songSec, g) * steps) / steps;
  return ((songSec - songSecAt(step, g)) * 1000) / rate;
}
/** The live number's colour band: good ≤ 25 ms, ok ≤ 60 ms, else bad. */
export const jamBand = (ms: number | undefined): 'none' | 'good' | 'ok' | 'bad' => (ms === undefined ? 'none' : Math.abs(ms) <= 25 ? 'good' : Math.abs(ms) <= 60 ? 'ok' : 'bad');
export const jamLive = (ms: number | undefined) => (ms === undefined ? '—' : `${ms > 0 ? '+' : ''}${Math.round(ms)} ms`);
export const timing = (ms: number) => (Math.abs(ms) < 5 ? 'right on the beat' : ms < 0 ? `rushing by ${-ms} ms` : `dragging by ${ms} ms`);
/** Start: from the top when there are under 5 s left. */
export const jamStartAt = (songSec: number, duration: number) => (songSec >= duration - 5 ? 0 : null);
/** Fewer than 8 hits: no score. */
export const scoreJamTake = (hits: JamHit[], g: BeatGrid, steps: number, rate: number): JamStats | null => (hits.length < 8 ? null : scoreJam(hits, g, steps, rate));

export function jamResultTiles(s: JamStats) {
  return [
    { big: `${s.onGridPct}%`, small: `hits on the beat (±${WINDOWS.good} ms) · ${s.perfectPct}% within ±${WINDOWS.perfect} ms` },
    { big: timing(s.meanOffset), small: `consistency ±${s.spread} ms` },
    { big: s.driftMsPerMin === null ? '—' : Math.abs(s.driftMsPerMin) < 30 ? 'steady tempo' : s.driftMsPerMin < 0 ? 'speeding up' : 'slowing down',
      small: s.driftMsPerMin === null ? 'play 20 s or more to measure drift' : `drift ${s.driftMsPerMin} ms per minute` },
  ];
}
const COMPARED = ['', 'quarters', '8ths', '', '16ths'];
/** What the coach hears about a jam (POST /api/coach/feedback `summary`). */
export const jamSummary = (s: YtSong, g: BeatGrid, rate: number, steps: number, stats: JamStats) =>
  ({ mode: 'jam', song: s.title, bpm: Math.round(g.bpm * rate), speedPct: Math.round(rate * 100), comparedWith: COMPARED[steps], ...stats });
/** The run a jam saves (the web's POST /api/runs body). */
export function jamRun(s: YtSong, g: BeatGrid, rate: number, stats: JamStats, startedAt: string, durationS: number): RunInput {
  return {
    chartId: `jam-${s.id}`.slice(0, 80), chartTitle: `Jam · ${s.title}`.slice(0, 120), startedAt, durationS,
    bpm: g.bpm * rate, speed: rate, accuracy: stats.onGridPct, meanOffset: stats.meanOffset, spread: stats.spread,
    summary: { mode: 'jam', song: s.title, ...stats },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 4 · Play (scored) and Stage mode (PlayMode.tsx)

/** The song's part as a chart on this version's grid, and its first/last bar. */
export function songPart(s: YtSong, g: BeatGrid) {
  const bpb = beatsPerBar(s), notes = s.notes.filter(n => n.t >= 0);
  const lastBar = notes.length ? Math.floor(notes[notes.length - 1].t / bpb) + 1 : 1;
  const firstBar = notes.length ? Math.floor(notes[0].t / bpb) + 1 : 1;
  const chart: Chart & { id: string } = { id: s.id, title: s.title, kind: 'song', bpm: g.bpm, timeSignature: s.timeSignature, bars: lastBar, notes };
  return { chart, bpb, firstBar, lastBar };
}
/**
 * The chart and options for the core take engine (the web's PlayMode start()): the song is the clock (`external`),
 * one bar of count-in from the video itself (it starts a bar before `from`), no click, scored like any exercise.
 */
export function songTakeOptions(o: { s: YtSong; g: BeatGrid; yt: SongPlayer; range: BarRange; rate: number }) {
  const { chart, bpb } = songPart(o.s, o.g);
  const from = o.range.from, to = Math.max(from, o.range.to);
  return {
    chart,
    opts: {
      fromBar: from, toBar: to, repeats: 1, speed: o.rate,
      metronome: false, subdivision: 1 as const, countInBars: 1, wait: false,
      external: {
        position: (now: number) => beatAt(o.yt.songTime(now), o.g) - (from - 1) * bpb,
        begin: () => { o.yt.seek(Math.max(0, songSecAt((from - 2) * bpb, o.g))); o.yt.play(); },
        end: () => o.yt.pause(),
      },
    },
  };
}
export const PLAY_EMPTY = 'Transcribe some bars in "Learn by ear" first, then play them here with the song.';
export const playHelp = (drumless: boolean) => `Plays your transcription as a note highway with this video${drumless ? ' (drumless)' : ''}. Switch to the drumless version for the real thing.`;
export const STAGE_LABEL = 'Stage mode: big video and an encore instead of the score sheet (for playing in front of friends)';
export const SHEET_EMPTY = 'Transcribe some bars in "Learn by ear" and they appear here as drum notation.';
export const SHEET_KEY = 'Your transcription so far. x = cymbals/hi-hat, o = open hi-hat, (note) = ghost note, > = accent; feet stems point down.';
