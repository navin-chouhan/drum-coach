// Practice's library: the built-in exercises (core LIBRARY) plus any saved charts, the kinds as tabs, search, and each
// exercise's tempo for today. Ported from the web's src/play/PlayView.tsx (Chooser) and src/content/charts.ts.
import type { Chart } from '@drum-coach/core/engine/chart';
import { practiceStart, type RunRow } from '@drum-coach/core/engine/progress';
import { LIBRARY } from '@drum-coach/core/content/library';

/** The web's StoredChart: a chart with an id and where it came from. */
export type PracticeChart = Chart & { id: string; source?: 'builtin' | 'import' | 'ai'; hasAudio?: boolean; syncOffsetMs?: number };
/** studentRead's answer, as far as Practice's tempos need it. */
export type Read = { pace: string; comfortableBpm?: number };

/**
 * Every exercise Practice offers: the built-ins, then saved charts (coach-written or imported). The iPad stores no
 * saved charts yet (songs and coach exercises come later, D5), so `saved` is empty for now.
 */
export const practiceCharts = (saved: PracticeChart[] = []): PracticeChart[] =>
  [...LIBRARY.map(c => ({ ...c, source: 'builtin' as const })), ...saved];

export const KIND_ICON: Record<string, string> = { groove: '🥁', rudiment: '🥢', fill: '💥', song: '🎵', exercise: '🎯' };
export const kindIcon = (c: Pick<Chart, 'kind'>) => KIND_ICON[c.kind ?? 'exercise'] ?? KIND_ICON.exercise;

export const TABS = [['foryou', 'For you'], ['groove', 'Grooves'], ['rudiment', 'Rudiments and drills'], ['fill', 'Fills'], ['song', 'Songs'], ['ai', 'From your coach']] as const;
export type TabId = (typeof TABS)[number][0];

/** Exercises (imported or untyped charts) live under Rudiments and drills, so every chart has a tab. */
export const inTab = (c: PracticeChart, tab: TabId) =>
  tab === 'foryou' ? false : tab === 'ai' ? c.source === 'ai' : tab === 'rudiment' ? ['rudiment', 'exercise'].includes(c.kind ?? 'exercise') : c.kind === tab;
export const tabCount = (charts: PracticeChart[], tab: TabId) => charts.filter(c => inTab(c, tab)).length;

/** The segmented control: For you, then each kind that has exercises, with its count. */
export const segments = (charts: PracticeChart[]) =>
  TABS.map(([id, label]) => ({ id, label, count: id === 'foryou' ? undefined : tabCount(charts, id) }))
    .filter(t => t.id === 'foryou' || (t.count ?? 0) > 0);

/** What a tab (or a search) lists. A search covers every exercise; For you lists nothing here (its cards do). */
export function listFor(charts: PracticeChart[], tab: TabId, query: string): PracticeChart[] {
  const q = query.trim().toLowerCase();
  if (q) return charts.filter(c => c.title.toLowerCase().includes(q));
  return charts.filter(c => inTab(c, tab));
}

/** The best clean tempo (90%+ landed) of an exercise, 0 when none. */
export const bestClean = (runs: RunRow[], chartId: string) =>
  Math.max(0, ...runs.filter(r => r.chartId === chartId && r.accuracy >= 90).map(r => Math.round(r.bpm)));
/** Today's first tempo for an exercise: where you left off (core practiceStart). */
export const startOf = (c: Pick<PracticeChart, 'id' | 'bpm'>, runs: RunRow[], read: Read) =>
  practiceStart(c.bpm, runs.filter(r => r.chartId === c.id).at(-1), read);

const bars = (n: number) => `${n} bar${n === 1 ? '' : 's'}`;
/** "starts at 70 today · best clean 80 · 2 bars" (the web's `plays`). */
export function playsLine(c: PracticeChart, runs: RunRow[], read: Read) {
  const best = bestClean(runs, c.id);
  return `starts at ${startOf(c, runs, read)} today${best ? ` · best clean ${best}` : ''} · ${bars(c.bars)}`;
}

/** One exercise as a list row or a card. */
export type ChartRow = {
  id: string; title: string; icon: string; description?: string; ai: boolean;
  startsAt: number; best: number; bars: number;
  /** "starts at 70 today · best clean 80 · 2 bars" */
  plays: string;
  /** The right-hand note in the library list: "best clean 80" or "not played". */
  bestWords: string;
};
export function chartRow(c: PracticeChart, runs: RunRow[], read: Read): ChartRow {
  const best = bestClean(runs, c.id), played = runs.some(r => r.chartId === c.id);
  return {
    id: c.id, title: c.title, icon: kindIcon(c), description: c.description, ai: c.source === 'ai',
    startsAt: startOf(c, runs, read), best, bars: c.bars, plays: playsLine(c, runs, read),
    bestWords: best ? `best clean ${best}` : played ? 'not clean yet' : 'not played',
  };
}
