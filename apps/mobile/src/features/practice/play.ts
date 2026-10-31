// Practice's play screen: the saved options, − / + tempo, loop bars, times round, Climb (2 clean takes → +5 BPM, up to
// 5 above your best), the main move and the coach line after a take, and the kit gestures. Ported from the web's
// src/play/PlayView.tsx (PlayView); the tempo rules are the core's (suggestNext, practiceStart, lateTakes).
import type { KeyValueStore } from '@drum-coach/core/platform';
import type { PadCommand } from '@drum-coach/core/engine/padCommands';
import { lateTakes, MAX_SPEED, practiceStart, suggestNext, type RunRow } from '@drum-coach/core/engine/progress';
import type { Finished } from '@drum-coach/core/play/take';
import { bestClean, type PracticeChart, type Read } from './catalog';
import { syncLine } from '../songs/sync';
import { latencyLine } from '../results/details';

/** The web's localStorage key (KV_KEYS.playOptions). */
export const PLAY_OPTIONS_KEY = 'drumcoach.playOptions';
/** What Practice remembers between visits (the web's `Saved`): climb = 2 clean takes → +5 BPM, up to 5 above your best. */
export type PracticeOptions = {
  chartId: string; speed: number; metronome: boolean; subdivision: number; countInBars: number; wait: boolean; repeats: number;
  guide?: boolean; climb?: boolean;
};
export const PLAY_DEFAULTS: PracticeOptions = { chartId: 'rock-8ths', speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false, repeats: 4 };

export function readPlayOptions(kv: Pick<KeyValueStore, 'get'>): PracticeOptions {
  try {
    const saved = JSON.parse(kv.get(PLAY_OPTIONS_KEY) ?? '{}') as unknown;
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...PLAY_DEFAULTS, ...(saved as Partial<PracticeOptions>) } : PLAY_DEFAULTS;
  } catch { return PLAY_DEFAULTS; }
}
export function writePlayOptions(kv: KeyValueStore, prev: PracticeOptions, patch: Partial<PracticeOptions>): PracticeOptions {
  const next = { ...prev, ...patch };
  try { kv.set(PLAY_OPTIONS_KEY, JSON.stringify(next)); } catch { /* kept for this session */ }
  return next;
}

/** The speed that lands a chart on a tempo: 50% to 125% of its own. */
export const speedFor = (bpm: number, chartBpm: number) => Math.max(0.5, Math.min(MAX_SPEED, bpm / chartBpm));
export const tempoOf = (c: Pick<PracticeChart, 'bpm'>, speed: number) => Math.round(c.bpm * speed);
/** Climb stops 5 above your best clean tempo (or the chart's own tempo). */
export const climbCap = (c: Pick<PracticeChart, 'id' | 'bpm'>, runs: RunRow[]) => Math.max(bestClean(runs, c.id), c.bpm) + 5;

/**
 * Climb, once the take is saved: 2 clean takes at this tempo move it up 5, up to 5 above your best. `runs` include the
 * take just played; interrupted takes (D6) are left out. Returns the new speed, or undefined to stay.
 */
export function climbAfterTake(c: PracticeChart, runs: (RunRow & { interrupted?: true })[], speed: number): number | undefined {
  const mine = runs.filter(r => r.chartId === c.id && !r.interrupted); // an interrupted take never counts (D6)
  if (!mine.length) return undefined;
  const sg = suggestNext(mine, [{ id: c.id, title: c.title, bpm: c.bpm, level: c.level }]);
  const cap = Math.max(c.bpm, ...mine.filter(r => r.accuracy >= 90).map(r => Math.round(r.bpm))) + 5;
  return sg.chartId === c.id && sg.bpm > Math.round(c.bpm * speed) && sg.bpm <= cap ? speedFor(sg.bpm, c.bpm) : undefined;
}

/** The bars a take covers: a loop of picked bars, or the whole chart. */
export type Section = { from: number; to: number } | null;
export const sectionRange = (section: Section, bars: number) =>
  ({ from: Math.min(section?.from ?? 1, bars), to: Math.min(section?.to ?? bars, bars) });
/** Tapping bar b: a single bar first, then a second tap stretches the loop from it to b; a third starts over. */
export const pickBar = (section: Section, b: number): Section =>
  (!section || section.from !== section.to ? { from: b, to: b } : { from: Math.min(section.from, b), to: Math.max(section.from, b) });
/** Up to 16 bars: a button per bar; longer charts get from / to fields. */
export const barPickKind = (bars: number) => (bars <= 1 ? 'none' : bars <= 16 ? 'buttons' : 'fields');
export const clampRepeats = (n: number) => Math.max(1, Math.min(50, Math.round(n)));

/** The bars a take covers as their own chart (what the sheet shows before a take), starting at beat 0. */
export function sectionChart<C extends Pick<PracticeChart, 'notes' | 'bars' | 'timeSignature'>>(c: C, section: Section): C {
  const { from, to } = sectionRange(section, c.bars);
  if (from === 1 && to === c.bars) return c;
  const bpb = (c.timeSignature[0] * 4) / c.timeSignature[1], start = (from - 1) * bpb, end = to * bpb;
  return { ...c, bars: to - from + 1, notes: c.notes.filter(n => n.t >= start - 1e-9 && n.t < end - 1e-9).map(n => ({ ...n, t: n.t - start })) };
}

/** What a finished take tells this screen (the take engine's Finished, as far as Practice reads it). */
export type TakeSummary = {
  accuracy: number; hits: number; wait: boolean; demo: boolean;
  /** Climb moved the tempo after this take. */
  climbed?: boolean;
};
/** The warm-up in progress: which exercise of how many, and whether the current one has finished. */
export type WarmState = { i: number; ids: string[]; titles: string[]; done: boolean };
/** The coach's answer to this take, when it came (A7e's session): a line, and a move it suggests. */
export type CoachReply = { line?: string; move?: { label: string } };

export type PlayInput = {
  chart: PracticeChart;
  options: PracticeOptions;
  /** Every run, oldest first, including the take just saved. */
  runs: RunRow[];
  read: Read;
  /** The last take of this chart on this screen (not a demo), or undefined before the first. */
  take?: TakeSummary;
  playing: boolean;
  warm?: WarmState;
  reply?: CoachReply;
};
export type MainMove =
  | { kind: 'stopWarm'; label: string }
  | { kind: 'coach'; label: string }
  | { kind: 'play'; label: string; bpm: number };
export type Move = { id: 'main' | 'listen' | 'again' | 'faster' | 'slower' | 'next'; label: string; gesture?: string; bpm?: number };

export type PlayModel = {
  bpm: number; best: number; cap: number; startAt: number; next: number;
  main: MainMove;
  /** The four smaller moves next to the main one, in the web's order. */
  moves: Move[];
  line: string;
  /** "3 takes here. Best: 92% landed at 80 BPM." */
  history: string;
  /** % landed in the last 12 takes here (the sparkline), oldest first. */
  recent: number[];
};

export function playModel(input: PlayInput): PlayModel {
  const { chart, options: o, runs, read, take: f, warm, reply } = input;
  const bpm = tempoOf(chart, o.speed);
  const mine = runs.filter(r => r.chartId === chart.id);
  const last = mine.at(-1);
  const best = bestClean(runs, chart.id);
  const cap = climbCap(chart, runs);
  const sug = f && !f.wait && mine.length ? suggestNext(mine, [{ id: chart.id, title: chart.title, bpm: chart.bpm, level: chart.level }]) : undefined;
  const next = sug?.chartId === chart.id ? sug.bpm : bpm;
  const startAt = practiceStart(bpm, last, read);
  const main: MainMove = warm ? { kind: 'stopWarm', label: '⏹ Stop the warm-up' }
    : reply?.move ? { kind: 'coach', label: reply.move.label }
    : !f ? (startAt !== bpm ? { kind: 'play', label: `▶ Play at ${startAt}`, bpm: startAt } : { kind: 'play', label: '▶ Play', bpm })
    : next > bpm ? { kind: 'play', label: `🐇 Try ${next}`, bpm: next }
    : next < bpm ? { kind: 'play', label: `🐢 Try ${next}`, bpm: next }
    : { kind: 'play', label: `▶ Again at ${bpm}`, bpm };
  const againIsMain = !warm && !reply?.move && !!f && next === bpm;
  const moves: Move[] = [
    { id: 'listen', label: f && f.hits ? '🎧 Hear your take' : '👂 Hear it', gesture: 'tom 2 × 2' },
    f && !againIsMain ? { id: 'again', label: `▶ Again at ${bpm}`, bpm } : { id: 'faster', label: '🐇 +5 BPM', gesture: 'tom 1 × 2', bpm: bpm + 5 },
    { id: 'slower', label: '🐢 −5 BPM', gesture: 'floor × 2', bpm: bpm - 5 },
    { id: 'next', label: '⏭ Next one', gesture: 'ride × 2' },
  ];
  const line = warm ? warmLine(warm, input.playing, chart.title, bpm)
    : reply?.line ?? (f ? (f.climbed ? `Two clean takes in a row! Up to ${bpm}.` : next > bpm ? `Two clean takes in a row! Ready for ${next}?` : next < bpm ? `Let's take it to ${next} and lock it in.` : `${f.accuracy >= 90 ? 'Nice!' : 'Good.'} Once more at ${bpm}?`)
    : last && last.accuracy < 60 ? `Last time ${Math.round(last.bpm)} BPM was tricky. Let's warm up at ${startAt}.`
    : last ? `Last time ${Math.round(last.bpm)} BPM, ${Math.round(last.accuracy)}% landed. Start there?`
    : chart.description ?? `Ready when you are: ${bpm} BPM.`);
  const recent = mine.slice(-12);
  return { bpm, best, cap, startAt, next, main, moves, line, history: historyLine(mine), recent: recent.map(r => Math.round(r.accuracy)) };
}

function warmLine(w: WarmState, playing: boolean, title: string, bpm: number) {
  if (playing) return '';
  return w.i + 1 < w.ids.length && w.done ? `Warm-up ${w.i + 1} of ${w.ids.length} done. Next: ${w.titles[w.i + 1]}…` : `Warm-up ${w.i + 1} of ${w.ids.length}: ${title} at ${bpm}.`;
}

/** "Your takes here": how many, the best, and a word when they all land late (latency) or the last few were hard. */
export function historyLine(mine: RunRow[]): string {
  if (!mine.length) return 'Your takes of this one show up here.';
  const bestRun = mine.reduce((x, r) => (r.accuracy > x.accuracy ? r : x));
  const recent = mine.slice(-12);
  const lean = lateTakes(mine);
  return `${mine.length} take${mine.length === 1 ? '' : 's'} here. Best: ${Math.round(bestRun.accuracy)}% landed at ${Math.round(bestRun.bpm)} BPM.${lean ? ' They all land late by about the same amount: check the latency in Setup first.'
    : recent.length >= 3 && recent.slice(-3).every(r => r.accuracy < 60) ? ' The last few were hard: a slower tempo helps it stick.' : ''}`;
}

/**
 * Intro slides come before the first take of an exercise, or after a tempo jump of more than 10 BPM; never for a demo,
 * the warm-up or wait mode, nor with the slides switched off.
 */
export const needsIntro = (p: { demo?: boolean; warm?: boolean; wait: boolean; introOn: boolean; seenBpm?: number; bpm: number }) =>
  !p.demo && !p.warm && !p.wait && p.introOn && (p.seenBpm === undefined || Math.abs(p.seenBpm - p.bpm) > 10);

/** Kit gestures between takes (the web's onCoachAction on this screen): yes = the main move, floor / tom 1 = 5 slower / faster and play, ride = next. */
export type PlayAction = { kind: 'main' } | { kind: 'listen' } | { kind: 'next' } | { kind: 'playAt'; bpm: number };
export function playGesture(cmd: PadCommand, bpm: number): PlayAction | undefined {
  switch (cmd) {
    case 'yes': return { kind: 'main' };
    case 'listen': return { kind: 'listen' };
    case 'next': return { kind: 'next' };
    case 'faster': return { kind: 'playAt', bpm: bpm + 5 };
    case 'slower': return { kind: 'playAt', bpm: bpm - 5 };
    default: return undefined; // stop is the take's (crash × 4)
  }
}

/** ⏭ Next one: the next exercise in the library, round to the first. */
export const nextChartId = (charts: Pick<PracticeChart, 'id'>[], id: string) =>
  (charts[charts.findIndex(c => c.id === id) + 1] ?? charts[0]).id;

/** "How it plays": the web's chips (the take's options and two app settings). */
export type ChipId = 'click' | 'eighths' | 'countIn' | 'guide' | 'wait' | 'hints' | 'intro';
export type Chip = { id: ChipId; label: string; note: string; on: boolean };
export function howItPlays(o: PracticeOptions, s: { hints?: boolean; intro?: boolean }): Chip[] {
  return [
    { id: 'click', label: '🔔 Click', note: 'on every beat', on: o.metronome },
    { id: 'eighths', label: '⁘ 8th click', note: 'click on the &s too', on: o.subdivision === 2 },
    { id: 'countIn', label: '1 bar count-in', note: 'before each take', on: o.countInBars > 0 },
    { id: 'guide', label: '🎶 Play along', note: 'I play softly under you', on: !!o.guide },
    { id: 'wait', label: '🐢 Wait mode', note: 'waits for each note', on: o.wait },
    { id: 'hints', label: '💡 Hints', note: 'count, sticking, beat ball', on: s.hints !== false },
    { id: 'intro', label: '📋 Intro slides', note: 'before the first take', on: s.intro !== false },
  ];
}
/** Flipping a chip: a patch for the options or for the app settings. */
export function flipChip(id: ChipId, o: PracticeOptions, s: { hints?: boolean; intro?: boolean }):
  { options?: Partial<PracticeOptions>; settings?: { hints?: boolean; intro?: boolean } } {
  switch (id) {
    case 'click': return { options: { metronome: !o.metronome } };
    case 'eighths': return { options: { subdivision: o.subdivision === 2 ? 1 : 2 } };
    case 'countIn': return { options: { countInBars: o.countInBars ? 0 : 1 } };
    case 'guide': return { options: { guide: !o.guide } };
    case 'wait': return { options: { wait: !o.wait } };
    case 'hints': return { settings: { hints: s.hints === false } };
    case 'intro': return { settings: { intro: s.intro === false } };
  }
}

/**
 * The side card after a take (the web's "Your take"): notes landed of the notes, in a row and comebacks, the last
 * live tip, and the latency hint when every stroke is off by the same amount. `pass` at 90% and up.
 */
export function yourTakeCard(f: Pick<Finished, 'stats' | 'cues' | 'results' | 'options'>) {
  const s = f.stats;
  return {
    landed: s.total - s.miss, total: s.total, pass: s.accuracy >= 90,
    small: `${s.streak} in a row · ${s.recoveries} comebacks`,
    tip: f.cues.at(-1)?.text,
    latency: latencyLine(f),
  };
}

/** ⚙ More (the web's): the latency correction when one is set, and Song sync for a chart with its own audio. */
export const moreCard = (latencyMs: number, chart: { hasAudio?: boolean; syncOffsetMs?: number }) => ({
  latency: latencyMs !== 0 ? `Latency correction: ${latencyMs} ms` : '',
  sync: syncLine(chart),
});
